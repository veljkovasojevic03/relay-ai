import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  isValidSharedSecret,
  MAX_SKEW_MS,
  signedHeaders,
  signEvent,
  verifySignature,
} from "./signing";

const SECRET = "s".repeat(64);
const EVENT = "11111111-1111-4111-8111-111111111111";
const NOW = 1_760_950_000_000;

describe("signEvent", () => {
  it("is hex HMAC-SHA256 over `<timestamp>.<eventId>` (the workbook's openssl recipe)", () => {
    const expected = createHmac("sha256", SECRET).update(`${NOW}.${EVENT}`).digest("hex");
    expect(signEvent(SECRET, NOW, EVENT)).toBe(expected);
    expect(signEvent(SECRET, String(NOW), EVENT)).toBe(expected);
  });

  it("signedHeaders carries timestamp, signature and the idempotency key", () => {
    expect(signedHeaders(SECRET, EVENT, NOW)).toEqual({
      "X-Relay-Timestamp": String(NOW),
      "X-Relay-Signature": signEvent(SECRET, NOW, EVENT),
      "Idempotency-Key": EVENT,
    });
  });
});

describe("verifySignature", () => {
  const valid = { secret: SECRET, timestamp: String(NOW), eventId: EVENT, now: NOW };
  const sig = signEvent(SECRET, NOW, EVENT);

  it("accepts a fresh, correctly signed request (also with an uppercase hex signature)", () => {
    expect(verifySignature({ ...valid, signature: sig })).toEqual({ ok: true });
    expect(verifySignature({ ...valid, signature: sig.toUpperCase() })).toEqual({ ok: true });
  });

  it.each([
    ["no timestamp", { timestamp: null }],
    ["no signature", { signature: null }],
    ["no eventId", { eventId: null }],
    ["a non-numeric timestamp", { timestamp: "yesterday" }],
  ])("is a bad request with %s", (_name, override) => {
    expect(verifySignature({ ...valid, signature: sig, ...override })).toEqual({
      ok: false,
      error: "bad_request",
    });
  });

  it("refuses timestamps more than 5 minutes off, in both directions", () => {
    for (const ts of [NOW - MAX_SKEW_MS - 1, NOW + MAX_SKEW_MS + 1]) {
      const signature = signEvent(SECRET, ts, EVENT);
      expect(verifySignature({ ...valid, timestamp: String(ts), signature })).toEqual({
        ok: false,
        error: "stale_timestamp",
      });
    }
    const edge = NOW - MAX_SKEW_MS;
    expect(
      verifySignature({
        ...valid,
        timestamp: String(edge),
        signature: signEvent(SECRET, edge, EVENT),
      }),
    ).toEqual({ ok: true });
  });

  it.each([
    ["the wrong secret", signEvent("x".repeat(64), NOW, EVENT)],
    ["another eventId", signEvent(SECRET, NOW, "22222222-2222-4222-8222-222222222222")],
    ["a truncated signature", sig.slice(0, 40)],
    ["a non-hex signature", "z".repeat(64)],
  ])("refuses %s as invalid_signature, without throwing", (_name, signature) => {
    expect(verifySignature({ ...valid, signature })).toEqual({
      ok: false,
      error: "invalid_signature",
    });
  });
});

describe("isValidSharedSecret", () => {
  it("matches only the exact secret", () => {
    expect(isValidSharedSecret(SECRET, SECRET)).toBe(true);
    expect(isValidSharedSecret(`${SECRET} `, SECRET)).toBe(false);
    expect(isValidSharedSecret("short", SECRET)).toBe(false);
    expect(isValidSharedSecret(null, SECRET)).toBe(false);
    expect(isValidSharedSecret(SECRET, undefined)).toBe(false);
  });
});

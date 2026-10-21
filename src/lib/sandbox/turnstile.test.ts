import { describe, expect, it, vi } from "vitest";

import { SITEVERIFY_URL, verifyTurnstile } from "./turnstile";

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("verifyTurnstile", () => {
  it("posts secret, token and IP to siteverify", async () => {
    const fetchImpl = reply({ success: true });
    const result = await verifyTurnstile("tok", { secret: "s3cret", ip: "203.0.113.9", fetchImpl });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(SITEVERIFY_URL);
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe("s3cret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("203.0.113.9");
  });

  it("rejects missing, non-string and oversized tokens without calling Cloudflare", async () => {
    const fetchImpl = reply({ success: true });
    for (const token of [undefined, "", 42, "x".repeat(2049)]) {
      expect(await verifyTurnstile(token, { secret: "s", fetchImpl })).toEqual({
        ok: false,
        reason: "missing_token",
      });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("treats anything but success: true as rejected", async () => {
    for (const body of [
      { success: false, "error-codes": ["invalid-input-response"] },
      {},
      { success: "true" },
    ]) {
      expect(await verifyTurnstile("tok", { secret: "s", fetchImpl: reply(body) })).toEqual({
        ok: false,
        reason: "rejected",
      });
    }
  });

  it("reports Cloudflare errors and network failures as unavailable", async () => {
    expect(await verifyTurnstile("tok", { secret: "s", fetchImpl: reply({}, 500) })).toEqual({
      ok: false,
      reason: "unavailable",
    });
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await verifyTurnstile("tok", { secret: "s", fetchImpl: failing })).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

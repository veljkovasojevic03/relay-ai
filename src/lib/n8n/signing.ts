import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Request signing between the app and n8n (spec §5.8, §8). Both directions use the same
 * scheme:
 *
 *   X-Relay-Timestamp: <ms since epoch>
 *   X-Relay-Signature: hex(HMAC-SHA256(N8N_SHARED_SECRET, "<timestamp>.<eventId>"))
 *
 * Deliberate simplification: the signature authenticates the sender and freshness, not the
 * body; payload integrity relies on TLS (documented in docs/N8N_CONTRACT.md).
 */

/** How far a timestamp may be from the receiver's clock, either way. */
export const MAX_SKEW_MS = 5 * 60 * 1000;

export function signEvent(secret: string, timestamp: number | string, eventId: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${eventId}`).digest("hex");
}

/** The three headers of every app → n8n call. */
export function signedHeaders(secret: string, eventId: string, now = Date.now()) {
  const timestamp = String(now);
  return {
    "X-Relay-Timestamp": timestamp,
    "X-Relay-Signature": signEvent(secret, timestamp, eventId),
    "Idempotency-Key": eventId,
  };
}

export type VerifyResult =
  { ok: true } | { ok: false; error: "bad_request" | "stale_timestamp" | "invalid_signature" };

/**
 * Checks a signed request, in the order the workbook teaches: inputs present, timestamp
 * fresh, signature equal (constant time).
 */
export function verifySignature(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  eventId: string | null | undefined;
  now?: number;
}): VerifyResult {
  const { timestamp, signature, eventId } = input;
  if (!timestamp || !signature || !eventId) return { ok: false, error: "bad_request" };
  if (!/^\d{1,16}$/.test(timestamp)) return { ok: false, error: "bad_request" };
  if (Math.abs((input.now ?? Date.now()) - Number(timestamp)) > MAX_SKEW_MS) {
    return { ok: false, error: "stale_timestamp" };
  }
  if (!/^[0-9a-f]{64}$/i.test(signature)) return { ok: false, error: "invalid_signature" };
  const expected = Buffer.from(signEvent(input.secret, timestamp, eventId), "hex");
  const given = Buffer.from(signature, "hex");
  return timingSafeEqual(expected, given)
    ? { ok: true }
    : { ok: false, error: "invalid_signature" };
}

/**
 * Constant-time check of the `X-Relay-Secret` header on the pull endpoints n8n calls. Both
 * sides are hashed first, so lengths never leak and the comparison never throws.
 */
export function isValidSharedSecret(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const given = createHash("sha256").update(header).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}

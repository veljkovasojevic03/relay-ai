import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of an `Authorization: Bearer <secret>` header. Both sides are hashed first
 * so the comparison runs on equal-length buffers and leaks neither content nor length.
 */
export function isAuthorizedBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const match = /^Bearer (.+)$/.exec(header);
  if (!match?.[1]) return false;
  const given = createHash("sha256").update(match[1]).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}

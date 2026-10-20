import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Visitor conversation tokens (spec §5.4): 128 random bits, handed to the widget once and
 * stored only as a SHA-256 hash. The token is a bearer secret for one conversation.
 */

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** A fresh token: 16 random bytes, base64url (22 characters). */
export function newConversationToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Shape check before any hashing or lookup; rejects junk headers cheaply. */
export function isWellFormedToken(token: string | null | undefined): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/** Hex SHA-256 of the token, the only form that is stored. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time check that `token` hashes to `storedHash`. The lookup by hash found the row;
 * this re-checks the full value without an early-exit string comparison.
 */
export function tokenMatchesHash(token: string, storedHash: string): boolean {
  const given = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

import { describe, expect, it } from "vitest";

import { hashToken, isWellFormedToken, newConversationToken, tokenMatchesHash } from "./token";

describe("conversation tokens", () => {
  it("are 128-bit base64url values, different every time", () => {
    const tokens = new Set(Array.from({ length: 200 }, newConversationToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(16);
    }
  });

  it("are stored as a SHA-256 hex hash only", () => {
    const token = newConversationToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashToken(token)).toBe(hash);
  });

  it("match only their own hash", () => {
    const token = newConversationToken();
    expect(tokenMatchesHash(token, hashToken(token))).toBe(true);
    expect(tokenMatchesHash(newConversationToken(), hashToken(token))).toBe(false);
    // A malformed stored value never throws, it just doesn't match.
    expect(tokenMatchesHash(token, "abc")).toBe(false);
  });

  it.each([null, undefined, "", "short", "x".repeat(23), "AAAAAAAAAAAAAAAAAAAA==", "a b"])(
    "rejects malformed token %j before any lookup",
    (value) => {
      expect(isWellFormedToken(value)).toBe(false);
    },
  );
});

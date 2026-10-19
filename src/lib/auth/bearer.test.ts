import { describe, expect, it } from "vitest";

import { isAuthorizedBearer } from "./bearer";

const secret = "s".repeat(40);

describe("isAuthorizedBearer", () => {
  it("accepts the exact secret", () => {
    expect(isAuthorizedBearer(`Bearer ${secret}`, secret)).toBe(true);
  });

  it.each([
    ["missing header", null],
    ["empty header", ""],
    ["wrong scheme", `Basic ${secret}`],
    ["no space", `Bearer${secret}`],
    ["wrong secret", `Bearer ${"t".repeat(40)}`],
    ["prefix of secret", `Bearer ${secret.slice(0, 20)}`],
    ["secret plus suffix", `Bearer ${secret}x`],
    ["empty token", "Bearer "],
  ])("rejects %s", (_name, header) => {
    expect(isAuthorizedBearer(header, secret)).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    expect(isAuthorizedBearer("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedBearer("Bearer anything", "")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { clientIp, hashIp } from "./ip";

describe("clientIp", () => {
  it("takes the first forwarded address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
  });

  it("falls back to x-real-ip and then to null", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": "x".repeat(65) }))).toBeNull();
  });
});

describe("hashIp", () => {
  it("is stable per salt and never contains the address", () => {
    const a = hashIp("203.0.113.7", "salt-one-123456789");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(hashIp("203.0.113.7", "salt-one-123456789"));
    expect(a).not.toBe(hashIp("203.0.113.7", "salt-two-123456789"));
    expect(a).not.toContain("203");
  });
});

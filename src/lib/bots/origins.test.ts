import { describe, expect, it } from "vitest";

import { normalizeOrigin, normalizeOrigins } from "./origins";

describe("normalizeOrigin", () => {
  it.each([
    ["https://kroj.rs", "https://kroj.rs"],
    ["kroj.rs", "https://kroj.rs"],
    ["  https://WWW.Kroj.RS/shop/cart?x=1#top  ", "https://www.kroj.rs"],
    ["https://kroj.rs:443", "https://kroj.rs"],
    ["https://staging.kroj.rs:8443/", "https://staging.kroj.rs:8443"],
    ["http://localhost:5500", "http://localhost:5500"],
    ["http://127.0.0.1:8080/index.html", "http://127.0.0.1:8080"],
    ["https://prodavnica-čarapa.rs", "https://xn--prodavnica-arapa-27b.rs"],
  ])("%j → %s", (input, origin) => {
    expect(normalizeOrigin(input)).toEqual({ ok: true, origin });
  });

  it.each([
    ["", "invalidOrigin"],
    ["shop", "invalidOrigin"],
    ["http://kroj.rs", "httpsRequired"],
    ["ftp://kroj.rs", "httpsRequired"],
    ["javascript:alert(1)", "invalidOrigin"],
    ["https://user:pass@kroj.rs", "invalidOrigin"],
    ["https://kroj..rs", "invalidOrigin"],
    ["https://[::1]", "invalidOrigin"],
    ["https://" + "a".repeat(300) + ".rs", "invalidOrigin"],
  ])("rejects %j with %s", (input, error) => {
    expect(normalizeOrigin(input)).toEqual({ ok: false, error });
  });

  it("produces values the database check constraint accepts", () => {
    // Mirrors public.is_valid_origin_list().
    const pattern =
      /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$|^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$/;
    for (const input of ["Kroj.rs/a", "https://a-b.c-d.example:8443", "http://localhost"]) {
      const result = normalizeOrigin(input);
      expect(result.ok && pattern.test(result.origin), input).toBe(true);
    }
  });
});

describe("normalizeOrigins", () => {
  it("normalizes every entry and rejects duplicates after normalization", () => {
    expect(normalizeOrigins(["kroj.rs", "https://www.kroj.rs"])).toEqual({
      ok: true,
      origins: ["https://kroj.rs", "https://www.kroj.rs"],
    });
    expect(normalizeOrigins(["kroj.rs", "https://KROJ.rs/"])).toEqual({
      ok: false,
      error: "duplicateOrigin",
      index: 1,
    });
  });

  it("caps the list", () => {
    const many = Array.from({ length: 21 }, (_, i) => `shop${i}.rs`);
    expect(normalizeOrigins(many)).toMatchObject({ ok: false, error: "tooManyOrigins" });
  });
});

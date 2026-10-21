import { describe, expect, it } from "vitest";

import { createNonce, ownerPagesCsp } from "./csp";

const directive = (csp: string, name: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1)
    .split(" ");

describe("ownerPagesCsp", () => {
  const csp = ownerPagesCsp({ nonce: "abc123", supabaseUrl: "https://ref.supabase.co/" });

  it("allows only nonce-bearing scripts in production", () => {
    const scripts = directive(csp, "script-src")!;
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("adds eval only in development", () => {
    const dev = ownerPagesCsp({ nonce: "n", dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("connects only to the app and the Supabase project", () => {
    expect(directive(csp, "connect-src")).toEqual([
      "'self'",
      "https://ref.supabase.co",
      "wss://ref.supabase.co",
    ]);
    expect(directive(csp, "img-src")).toContain("https://ref.supabase.co");
  });

  it("uses ws:// for a local Supabase stack and skips a missing or invalid URL", () => {
    const local = ownerPagesCsp({ nonce: "n", supabaseUrl: "http://127.0.0.1:54321" });
    expect(directive(local, "connect-src")).toContain("ws://127.0.0.1:54321");
    for (const supabaseUrl of [undefined, "not a url"]) {
      expect(directive(ownerPagesCsp({ nonce: "n", supabaseUrl }), "connect-src")).toEqual([
        "'self'",
      ]);
    }
  });

  it("blocks plugins, base tags, framing and foreign form targets", () => {
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'none'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "form-action")).toEqual([
      "'self'",
      "https://ref.supabase.co",
      "https://checkout.stripe.com",
      "https://billing.stripe.com",
    ]);
  });
});

describe("createNonce", () => {
  it("is 128 random bits, different every time", () => {
    const a = createNonce();
    expect(atob(a)).toHaveLength(16);
    expect(createNonce()).not.toBe(a);
  });
});

import { describe, expect, it } from "vitest";

import { hasLiveLlm, hasN8n, hasSupabase, parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("boots with an empty environment and applies defaults", () => {
    const env = parseServerEnv({});
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(env.DAILY_REAL_MESSAGE_CAP).toBe(200);
    expect(hasSupabase(env)).toBe(false);
    expect(hasLiveLlm(env)).toBe(false);
    expect(hasN8n(env)).toBe(false);
  });

  it("treats empty strings as unset", () => {
    const env = parseServerEnv({ ANTHROPIC_API_KEY: "  ", N8N_BASE_URL: "" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.N8N_BASE_URL).toBeUndefined();
  });

  it("rejects a short shared secret without echoing its value", () => {
    expect(() => parseServerEnv({ N8N_SHARED_SECRET: "tooshort" })).toThrowError(
      /N8N_SHARED_SECRET/,
    );
    expect(() => parseServerEnv({ N8N_SHARED_SECRET: "tooshort" })).not.toThrowError(/tooshort/);
  });

  it("rejects malformed URLs and non-integer caps", () => {
    expect(() => parseServerEnv({ N8N_BASE_URL: "not a url" })).toThrowError(/N8N_BASE_URL/);
    expect(() => parseServerEnv({ DAILY_REAL_MESSAGE_CAP: "1.5" })).toThrowError(
      /DAILY_REAL_MESSAGE_CAP/,
    );
  });

  it("refuses live Stripe keys", () => {
    expect(() => parseServerEnv({ STRIPE_SECRET_KEY: "sk_live_abc" })).toThrowError(/test-mode/);
    expect(parseServerEnv({ STRIPE_SECRET_KEY: "sk_test_abc" }).STRIPE_SECRET_KEY).toBe(
      "sk_test_abc",
    );
  });

  it("detects configured integrations", () => {
    const env = parseServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      N8N_BASE_URL: "http://localhost:5678",
      N8N_SHARED_SECRET: "x".repeat(32),
    });
    expect(hasSupabase(env)).toBe(true);
    expect(hasN8n(env)).toBe(true);
  });
});

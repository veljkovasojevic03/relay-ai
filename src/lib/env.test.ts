import { describe, expect, it } from "vitest";

import { hasLiveLlm, hasSupabase, parseServerEnv } from "./env";

const webhookBase = "http://localhost:5678/webhook";

describe("parseServerEnv", () => {
  it("boots with an empty environment and applies defaults", () => {
    const env = parseServerEnv({});
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(env.DAILY_REAL_MESSAGE_CAP).toBe(200);
    expect(env.N8N_MODE).toBe("simulated");
    expect(hasSupabase(env)).toBe(false);
    expect(hasLiveLlm(env)).toBe(false);
  });

  it("treats empty strings as unset", () => {
    const env = parseServerEnv({ ANTHROPIC_API_KEY: "  ", N8N_WEBHOOK_BASE: "" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.N8N_WEBHOOK_BASE).toBeUndefined();
  });

  it("rejects short secrets without echoing their values", () => {
    for (const key of ["N8N_SHARED_SECRET", "CRON_SECRET", "IP_HASH_SALT"]) {
      const run = () => parseServerEnv({ [key]: "tooshort" });
      expect(run).toThrowError(new RegExp(key));
      expect(run).not.toThrowError(/tooshort/);
    }
  });

  it("rejects malformed URLs and non-integer caps", () => {
    expect(() => parseServerEnv({ N8N_WEBHOOK_BASE: "not a url" })).toThrowError(
      /N8N_WEBHOOK_BASE/,
    );
    expect(() => parseServerEnv({ DAILY_REAL_MESSAGE_CAP: "1.5" })).toThrowError(
      /DAILY_REAL_MESSAGE_CAP/,
    );
  });

  it("derives n8n mode and requires credentials for real mode", () => {
    const secret = "x".repeat(32);
    expect(
      parseServerEnv({ N8N_WEBHOOK_BASE: webhookBase, N8N_SHARED_SECRET: secret }).N8N_MODE,
    ).toBe("real");
    expect(() => parseServerEnv({ N8N_MODE: "real" })).toThrowError(/N8N_MODE/);
    expect(() => parseServerEnv({ N8N_MODE: "sometimes" })).toThrowError(/N8N_MODE/);
    expect(parseServerEnv({ N8N_MODE: "simulated", N8N_WEBHOOK_BASE: webhookBase }).N8N_MODE).toBe(
      "simulated",
    );
  });

  it("refuses live Stripe keys", () => {
    expect(() => parseServerEnv({ STRIPE_SECRET_KEY: "sk_live_abc" })).toThrowError(/test-mode/);
    expect(parseServerEnv({ STRIPE_SECRET_KEY: "sk_test_abc" }).STRIPE_SECRET_KEY).toBe(
      "sk_test_abc",
    );
  });

  it("detects a configured Supabase project", () => {
    const env = parseServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    });
    expect(hasSupabase(env)).toBe(true);
  });
});

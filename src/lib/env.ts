import { z } from "zod";

/**
 * Environment contract (spec §10). Everything except the public app URL is optional so the app
 * can boot, and degrade gracefully, before each integration is configured. Feature code uses
 * the `has*` helpers instead of reading `process.env` directly.
 */

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const optionalSecret = (min: number) => optionalString.pipe(z.string().min(min).optional());

const optionalUrl = optionalString.pipe(z.url().optional());

const positiveInt = (fallback: number) =>
  optionalString.transform((v) => (v ? Number(v) : fallback)).pipe(z.number().int().positive());

export const serverEnvSchema = z
  .object({
    NEXT_PUBLIC_APP_URL: optionalUrl.transform((v) => v ?? "http://localhost:3000"),
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    IP_HASH_SALT: optionalSecret(16),
    CRON_SECRET: optionalSecret(32),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalString,
    TURNSTILE_SECRET_KEY: optionalString,
    ANTHROPIC_API_KEY: optionalString,
    LLM_MODEL_FREE: optionalString.transform((v) => v ?? "claude-haiku-4-5"),
    LLM_MODEL_PRO: optionalString.transform((v) => v ?? "claude-sonnet-5-5"),
    DAILY_REAL_MESSAGE_CAP: positiveInt(200),
    N8N_MODE: optionalString.pipe(z.enum(["simulated", "real"]).optional()),
    N8N_WEBHOOK_BASE: optionalUrl,
    N8N_SHARED_SECRET: optionalSecret(32),
    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,
    STRIPE_PRICE_PRO: optionalString,
  })
  .transform((env) => ({
    ...env,
    // Spec §8: simulated is the default whenever no webhook base is configured.
    N8N_MODE: env.N8N_MODE ?? (env.N8N_WEBHOOK_BASE ? ("real" as const) : ("simulated" as const)),
  }))
  .superRefine((env, ctx) => {
    if (env.N8N_MODE === "real" && !(env.N8N_WEBHOOK_BASE && env.N8N_SHARED_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["N8N_MODE"],
        message: "real mode needs N8N_WEBHOOK_BASE and N8N_SHARED_SECRET",
      });
    }
    // $0 rule: the demo must never be able to charge real cards.
    if (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
      ctx.addIssue({
        code: "custom",
        path: ["STRIPE_SECRET_KEY"],
        message: "must be a test-mode key",
      });
    }
  });

export type ServerEnv = z.output<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    // Report variable names and rule messages only, never values.
    const issues = result.error.issues
      .map((i) => (i.code === "custom" ? `${i.path.join(".")} (${i.message})` : i.path.join(".")))
      .join(", ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}

export const hasSupabase = (env: ServerEnv) =>
  Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
export const hasLiveLlm = (env: ServerEnv) => Boolean(env.ANTHROPIC_API_KEY);
export const hasStripe = (env: ServerEnv) =>
  Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_PRO);
export const hasTurnstile = (env: ServerEnv) =>
  Boolean(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);

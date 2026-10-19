import { z } from "zod";

/**
 * Environment contract. Everything except the public app URL is optional so the app can boot
 * (and degrade gracefully) before each integration is configured. Feature code must use the
 * `has*` helpers below instead of reading `process.env` directly.
 */

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.url().optional());

const positiveInt = (fallback: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : fallback))
    .pipe(z.number().int().positive());

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalString,
});

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  LLM_MODEL_FREE: z.string().trim().min(1).default("claude-haiku-4-5"),
  LLM_MODEL_PRO: z.string().trim().min(1).default("claude-sonnet-5-5"),
  DAILY_REAL_MESSAGE_CAP: positiveInt(200),
  N8N_BASE_URL: optionalUrl,
  N8N_SHARED_SECRET: optionalString.pipe(z.string().min(32).optional()),
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  STRIPE_PRICE_PRO: optionalString,
  TURNSTILE_SECRET_KEY: optionalString,
  CRON_SECRET: optionalString.pipe(z.string().min(32).optional()),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    // Report variable names only — never values.
    const fields = result.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  if (result.data.STRIPE_SECRET_KEY && !result.data.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
    // $0 rule: the demo must never be able to charge real cards.
    throw new Error("Invalid environment configuration: STRIPE_SECRET_KEY must be a test-mode key");
  }
  return result.data;
}

export const hasSupabase = (env: ServerEnv) =>
  Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    env.SUPABASE_SERVICE_ROLE_KEY,
  );
export const hasLiveLlm = (env: ServerEnv) => Boolean(env.ANTHROPIC_API_KEY);
export const hasN8n = (env: ServerEnv) => Boolean(env.N8N_BASE_URL && env.N8N_SHARED_SECRET);
export const hasStripe = (env: ServerEnv) =>
  Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_PRO);
export const hasTurnstile = (env: ServerEnv) =>
  Boolean(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);

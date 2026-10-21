#!/usr/bin/env node
// Runs a command with the env of the LOCAL Supabase stack (from `supabase status`), so tests
// and e2e builds can never point at the cloud project by accident.
//
//   node scripts/local-supabase.mjs -- pnpm exec playwright test
//
// The variables override .env.local (Next.js gives process env precedence over .env files).

import { execSync, spawnSync } from "node:child_process";

export function localSupabaseEnv() {
  let raw;
  try {
    raw = execSync("pnpm exec supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("Local Supabase is not running. Start it with: pnpm db:start");
  }
  const status = JSON.parse(raw.slice(raw.indexOf("{")));
  const url = new URL(status.API_URL);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(`Refusing to use a non-local Supabase API (${url.hostname})`);
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: status.DB_URL,
    MAILPIT_URL: status.MAILPIT_URL ?? status.INBUCKET_URL,
    // Like CI: no Turnstile (real keys only accept their own hostnames) and no Stripe.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    TURNSTILE_SECRET_KEY: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    STRIPE_PRICE_PRO: "",
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  const separator = process.argv.indexOf("--");
  const command = separator === -1 ? [] : process.argv.slice(separator + 1);
  if (command.length === 0) {
    console.error("Usage: node scripts/local-supabase.mjs -- <command> [args...]");
    process.exit(2);
  }
  // One shell string (not argv + shell:true) so behaviour is identical on Windows and POSIX.
  const result = spawnSync(command.join(" "), {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...localSupabaseEnv() },
  });
  process.exit(result.status ?? 1);
}

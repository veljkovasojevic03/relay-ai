import "server-only";

import { headers } from "next/headers";

import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { clientIp, hashIp } from "./ip";

let warnedNoSalt = false;

export type RateLimitRule = { name: string; limit: number; windowSeconds: number };

export const AUTH_RATE_LIMITS = {
  signIn: { name: "auth:sign-in", limit: 10, windowSeconds: 600 },
  signUp: { name: "auth:sign-up", limit: 5, windowSeconds: 3600 },
  passwordEmail: { name: "auth:password-email", limit: 5, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>;

/** Per signed-in owner; each playground question calls the embed function. */
export const PLAYGROUND_RATE_LIMIT: RateLimitRule = {
  name: "playground",
  limit: 30,
  windowSeconds: 60,
};

/**
 * Per-client-IP limit backed by `check_rate_limit`. Auth calls reach Supabase from the
 * server, so Supabase's own per-IP limits would only ever see the server's address.
 *
 * Fails open (allows) when the database or salt isn't configured or the check errors, and
 * logs it: locking every owner out is worse than a brief gap in throttling.
 */
export async function isWithinRateLimit(rule: RateLimitRule): Promise<boolean> {
  const salt = serverEnv().IP_HASH_SALT;
  const db = supabaseAdmin();
  const ip = clientIp(await headers());
  if (!salt || !db || !ip) {
    if (!salt && !warnedNoSalt) {
      warnedNoSalt = true;
      log.warn("rate_limit.disabled", { reason: "IP_HASH_SALT not set" });
    }
    return true;
  }

  return isWithinKeyedRateLimit(rule, hashIp(ip, salt));
}

/** Same check keyed by an id the server trusts (e.g. the signed-in owner's id). */
export async function isWithinOwnerRateLimit(rule: RateLimitRule, ownerId: string) {
  return isWithinKeyedRateLimit(rule, `owner:${ownerId}`);
}

/**
 * Limit keyed by any subject the server derived itself (an IP hash, a bot id, a
 * conversation id). Fails open like the others.
 */
export async function isWithinKeyedRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<boolean> {
  const db = supabaseAdmin();
  if (!db) return true;
  const { data, error } = await db.rpc("check_rate_limit", {
    p_key: `${rule.name}:${subject}`,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) {
    log.error("rate_limit.check_failed", { rule: rule.name, code: error.code });
    return true;
  }
  if (!data) log.info("rate_limit.blocked", { rule: rule.name });
  return data;
}

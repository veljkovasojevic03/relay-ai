"use server";

import { hasLocale } from "next-intl";
import { headers } from "next/headers";
import { after } from "next/server";

import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { hasSupabase, hasSupabaseAuth, hasTurnstile } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { indexFaqs } from "@/lib/faqs/indexing";
import type { FormState } from "@/lib/forms";
import { log } from "@/lib/log";
import { seedSandbox } from "@/lib/sandbox/seed";
import { verifyTurnstile } from "@/lib/sandbox/turnstile";
import { clientIp } from "@/lib/security/ip";
import { isWithinRateLimit, SANDBOX_RATE_LIMIT } from "@/lib/security/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formValues } from "@/lib/validation/auth";

function formLocale(values: Record<string, string>): Locale {
  return hasLocale(routing.locales, values.locale) ? values.locale : routing.defaultLocale;
}

let warnedNoTurnstile = false;

/**
 * "Explore the dashboard": Turnstile → per-IP limit → Supabase anonymous sign-in → seeded
 * workspace → dashboard. The database marks every anonymous account as a sandbox that
 * expires in 7 days; the cron tick deletes it then.
 */
export async function startSandboxAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const locale = formLocale(values);
  const env = serverEnv();
  const db = supabaseAdmin();
  if (!hasSupabase(env) || !hasSupabaseAuth(env) || !db) {
    return { status: "error", error: "notConfigured" };
  }

  // Already signed in: never replace a session (that would sign a real owner out).
  const current = await getCurrentUser();
  if (current) {
    const { data } = await db
      .from("profiles")
      .select("is_sandbox, sandbox_expires_at")
      .eq("id", current.id)
      .maybeSingle();
    const expired =
      data?.is_sandbox && data.sandbox_expires_at && new Date(data.sandbox_expires_at) < new Date();
    if (!expired) return redirect({ href: "/dashboard", locale });
    // An expired sandbox the cron tick hasn't removed yet: let it go, start a new one.
    await (await createSupabaseServerClient())?.auth.signOut();
  }

  if (hasTurnstile(env)) {
    const check = await verifyTurnstile(formData.get("cf-turnstile-response"), {
      secret: env.TURNSTILE_SECRET_KEY!,
      ip: clientIp(await headers()),
    });
    if (!check.ok) {
      log.info("sandbox.captcha_failed", { reason: check.reason });
      return {
        status: "error",
        error: check.reason === "unavailable" ? "sandboxUnavailable" : "captchaFailed",
      };
    }
  } else if (!warnedNoTurnstile) {
    warnedNoTurnstile = true;
    log.warn("sandbox.turnstile_disabled", { reason: "Turnstile keys not set" });
  }

  if (!(await isWithinRateLimit(SANDBOX_RATE_LIMIT))) {
    return { status: "error", error: "rateLimited" };
  }

  const supabase = (await createSupabaseServerClient())!;
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: locale === "sr" ? "Gost" : "Guest", ui_language: locale } },
  });
  if (error || !data.user) {
    log.error("sandbox.sign_in_failed", { code: error?.code ?? "no_user" });
    return {
      status: "error",
      error: error?.code === "over_request_rate_limit" ? "rateLimited" : "sandboxUnavailable",
    };
  }

  const userId = data.user.id;
  try {
    const { botId, pendingFaqIds } = await seedSandbox(db, userId, locale);
    // Only when the demo bot isn't indexed yet; the owner sees the status meanwhile.
    if (pendingFaqIds.length) after(() => indexFaqs(botId, pendingFaqIds));
    log.info("sandbox.created", { pendingFaqs: pendingFaqIds.length });
  } catch (e) {
    log.error("sandbox.seed_failed", { message: e instanceof Error ? e.message : "unknown" });
    await supabase.auth.signOut();
    await db.auth.admin.deleteUser(userId);
    return { status: "error", error: "sandboxUnavailable" };
  }

  return redirect({ href: "/dashboard", locale });
}

/** Deletes the visitor's own sandbox right away and opens sign-up. */
export async function endSandboxAction(formData: FormData): Promise<void> {
  const locale = formLocale(formValues(formData));
  const user = await getCurrentUser();
  const db = supabaseAdmin();
  if (user && db) {
    const { data } = await db.from("profiles").select("is_sandbox").eq("id", user.id).single();
    // Only ever a sandbox: a real account is never deleted from here.
    if (data?.is_sandbox) {
      await (await createSupabaseServerClient())?.auth.signOut();
      const { error } = await db.auth.admin.deleteUser(user.id);
      if (error) log.error("sandbox.delete_failed", { code: error.code ?? "unknown" });
      return redirect({ href: "/signup", locale });
    }
  }
  return redirect({ href: "/dashboard", locale });
}

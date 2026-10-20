"use server";

import { hasLocale } from "next-intl";
import { redirect as redirectExternal } from "next/navigation";

import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { authErrorKey } from "@/lib/auth/errors";
import { DEFAULT_AFTER_LOGIN, localizedPath, safeNextPath } from "@/lib/auth/redirects";
import { serverEnv } from "@/lib/env.server";
import type { FormState } from "@/lib/forms";
import { log } from "@/lib/log";
import { AUTH_RATE_LIMITS, isWithinRateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fieldErrors,
  forgotPasswordSchema,
  formValues,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";

// `next/root-params` is unavailable in Server Actions, so forms post their locale.
function formLocale(values: Record<string, string>): Locale {
  return hasLocale(routing.locales, values.locale) ? values.locale : routing.defaultLocale;
}

/** Where Supabase sends the browser after an email link or OAuth round trip. */
function callbackUrl(locale: Locale, next: string): string {
  const url = new URL("/api/auth/callback", serverEnv().NEXT_PUBLIC_APP_URL);
  url.searchParams.set("next", localizedPath(locale, next));
  return url.toString();
}

const notConfigured = { status: "error", error: "notConfigured" } as const satisfies FormState;
const rateLimited = { status: "error", error: "rateLimited" } as const satisfies FormState;

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const locale = formLocale(values);
  const parsed = signInSchema.safeParse(values);
  const keep = { email: values.email ?? "" };
  if (!parsed.success)
    return { status: "error", fieldErrors: fieldErrors(parsed.error), values: keep };

  if (!(await isWithinRateLimit(AUTH_RATE_LIMITS.signIn))) return { ...rateLimited, values: keep };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return notConfigured;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    log.info("auth.sign_in_failed", { code: error.code ?? "unknown" });
    return { status: "error", error: authErrorKey(error), values: keep };
  }

  // Land in the owner's saved dashboard language.
  const { data: profile } = await supabase
    .from("profiles")
    .select("ui_language")
    .eq("id", data.user.id)
    .single();
  const target = hasLocale(routing.locales, profile?.ui_language) ? profile.ui_language : locale;
  return redirect({ href: safeNextPath(parsed.data.next), locale: target });
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const locale = formLocale(values);
  const parsed = signUpSchema.safeParse(values);
  const keep = { email: values.email ?? "", displayName: values.displayName ?? "" };
  if (!parsed.success)
    return { status: "error", fieldErrors: fieldErrors(parsed.error), values: keep };

  if (!(await isWithinRateLimit(AUTH_RATE_LIMITS.signUp))) return { ...rateLimited, values: keep };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return notConfigured;

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: callbackUrl(locale, DEFAULT_AFTER_LOGIN),
      data: { display_name: parsed.data.displayName ?? undefined, ui_language: locale },
    },
  });
  if (error) {
    log.info("auth.sign_up_failed", { code: error.code ?? "unknown" });
    return { status: "error", error: authErrorKey(error), values: keep };
  }

  // With email confirmation off (local dev) Supabase signs the user in right away.
  if (data.session) return redirect({ href: DEFAULT_AFTER_LOGIN, locale });
  // Otherwise (also for an already registered email, by design) show "check your inbox"
  // without revealing whether the address had an account.
  return { status: "success", values: { email: parsed.data.email } };
}

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const locale = formLocale(values);
  const parsed = forgotPasswordSchema.safeParse(values);
  const keep = { email: values.email ?? "" };
  if (!parsed.success)
    return { status: "error", fieldErrors: fieldErrors(parsed.error), values: keep };

  if (!(await isWithinRateLimit(AUTH_RATE_LIMITS.passwordEmail))) {
    return { ...rateLimited, values: keep };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return notConfigured;

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl(locale, "/reset-password"),
  });
  if (error) {
    log.info("auth.reset_email_failed", { code: error.code ?? "unknown" });
    const key = authErrorKey(error);
    // Only surface errors that say nothing about whether the account exists.
    if (key === "rateLimited" || key === "invalidEmail") {
      return { status: "error", error: key, values: keep };
    }
  }
  return { status: "success", values: { email: parsed.data.email } };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const locale = formLocale(values);
  const parsed = resetPasswordSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return notConfigured;
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { status: "error", error: "sessionExpired" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    log.info("auth.password_update_failed", { code: error.code ?? "unknown" });
    return { status: "error", error: authErrorKey(error) };
  }
  return redirect({ href: DEFAULT_AFTER_LOGIN, locale });
}

export async function googleSignInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const locale = formLocale(values);
  const supabase = await createSupabaseServerClient();
  if (!supabase) return notConfigured;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl(locale, safeNextPath(values.next)),
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) {
    log.warn("auth.oauth_start_failed", { code: error?.code ?? "no_url" });
    return { status: "error", error: "oauthUnavailable" };
  }
  return redirectExternal(data.url);
}

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = formLocale(formValues(formData));
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect({ href: "/login", locale });
}

import "server-only";

import { getLocale } from "next-intl/server";
import { cache } from "react";

import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null };

/**
 * Data access layer for the signed-in owner. The JWT is verified (`getClaims`), and the
 * result is memoized for the rest of the request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: data.claims.email ?? null };
});

/**
 * Use in every protected Server Component and Server Action, not only in the proxy.
 * Server Actions must pass `locale` (next/root-params is unavailable there).
 */
export async function requireUser(locale?: Locale): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login", locale: locale ?? (await getLocale()) });
  return user;
}

export type OwnerProfile = {
  displayName: string | null;
  uiLanguage: "en" | "sr";
  notificationEmail: string | null;
  /** Weekly numbers by email, sent by n8n (spec §4.8 digest). */
  weeklyDigest: boolean;
  plan: "free" | "pro";
  /** Anonymous explore-the-dashboard account (Phase 9), deleted at `sandboxExpiresAt`. */
  isSandbox: boolean;
  sandboxExpiresAt: string | null;
  /** Mirrored from Stripe by the webhook (Phase 11); null without a subscription. */
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export const getOwnerProfile = cache(async (): Promise<OwnerProfile> => {
  const user = await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "display_name, ui_language, notification_email, weekly_digest, plan, is_sandbox, sandbox_expires_at, subscription_status, current_period_end, subscription_cancel_at_period_end",
    )
    .eq("id", user.id)
    .single();
  if (error) throw new Error("Could not load profile");
  return {
    displayName: data.display_name,
    uiLanguage: data.ui_language === "sr" ? "sr" : "en",
    notificationEmail: data.notification_email,
    weeklyDigest: data.weekly_digest === true,
    plan: data.plan === "pro" ? "pro" : "free",
    isSandbox: data.is_sandbox === true,
    sandboxExpiresAt: data.sandbox_expires_at,
    subscriptionStatus: data.subscription_status,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.subscription_cancel_at_period_end === true,
  };
});

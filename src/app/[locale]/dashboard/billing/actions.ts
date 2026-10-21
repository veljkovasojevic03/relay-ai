"use server";

import { hasLocale } from "next-intl";
import { redirect as redirectExternal } from "next/navigation";

import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/session";
import { stripeClient } from "@/lib/billing/stripe";
import { localizedPath } from "@/lib/auth/redirects";
import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";
import { isWithinOwnerRateLimit, type RateLimitRule } from "@/lib/security/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { formValues } from "@/lib/validation/auth";

const BILLING_RATE_LIMIT: RateLimitRule = { name: "billing", limit: 10, windowSeconds: 600 };

type BillingError = "notConfigured" | "sandbox" | "rateLimited" | "stripe" | "noCustomer";

function formLocale(formData: FormData): Locale {
  const { locale } = formValues(formData);
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

function billingUrl(locale: Locale, query: string) {
  return new URL(
    `${localizedPath(locale, "/dashboard/billing")}?${query}`,
    serverEnv().NEXT_PUBLIC_APP_URL,
  ).toString();
}

const fail = (locale: Locale, error: BillingError) =>
  redirect({ href: { pathname: "/dashboard/billing", query: { error } }, locale });

async function billingProfile(userId: string) {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data, error } = await db
    .from("profiles")
    .select("plan, is_sandbox, stripe_customer_id, notification_email")
    .eq("id", userId)
    .single();
  if (error) throw new Error(`billing profile lookup failed (${error.code})`);
  return data;
}

/**
 * "Upgrade to Pro": Stripe Checkout in test mode. The plan changes only when Stripe's
 * webhook confirms the subscription; returning to the success URL changes nothing.
 */
export async function startCheckoutAction(formData: FormData): Promise<void> {
  const locale = formLocale(formData);
  const user = await requireUser(locale);
  const stripe = stripeClient();
  const db = supabaseAdmin();
  const priceId = serverEnv().STRIPE_PRICE_PRO;
  const profile = await billingProfile(user.id);
  if (!stripe || !db || !priceId || !profile) return fail(locale, "notConfigured");
  if (profile.is_sandbox) return fail(locale, "sandbox");
  // Already paying: changes and cancellation happen in the portal.
  if (profile.plan === "pro" && profile.stripe_customer_id) return openPortalAction(formData);
  if (!(await isWithinOwnerRateLimit(BILLING_RATE_LIMIT, user.id))) {
    return fail(locale, "rateLimited");
  }

  let url: string | null;
  try {
    let customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? profile.notification_email ?? undefined,
        metadata: { profile_id: user.id },
      });
      const { data: stored, error } = await db.rpc("link_stripe_customer", {
        p_profile_id: user.id,
        p_customer_id: customer.id,
      });
      if (error || !stored) throw new Error(`link_stripe_customer failed (${error?.code})`);
      customerId = stored as string;
      // A parallel request linked its customer first: drop ours.
      if (customerId !== customer.id) await stripe.customers.del(customer.id).catch(() => {});
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { profile_id: user.id } },
      // Checkout has no Serbian; Croatian is the closest language it offers.
      locale: locale === "sr" ? "hr" : "en",
      success_url: billingUrl(locale, "checkout=success"),
      cancel_url: billingUrl(locale, "checkout=cancelled"),
    });
    url = session.url;
  } catch (error) {
    log.error("billing.checkout_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return fail(locale, "stripe");
  }
  if (!url) return fail(locale, "stripe");
  redirectExternal(url);
}

/** "Manage subscription": the Stripe customer portal (change card, cancel, invoices). */
export async function openPortalAction(formData: FormData): Promise<void> {
  const locale = formLocale(formData);
  const user = await requireUser(locale);
  const stripe = stripeClient();
  const profile = await billingProfile(user.id);
  if (!stripe || !profile) return fail(locale, "notConfigured");
  if (profile.is_sandbox) return fail(locale, "sandbox");
  if (!profile.stripe_customer_id) return fail(locale, "noCustomer");
  if (!(await isWithinOwnerRateLimit(BILLING_RATE_LIMIT, user.id))) {
    return fail(locale, "rateLimited");
  }

  let url: string;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: billingUrl(locale, "portal=returned"),
    });
    url = session.url;
  } catch (error) {
    log.error("billing.portal_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return fail(locale, "stripe");
  }
  redirectExternal(url);
}

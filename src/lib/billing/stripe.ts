import "server-only";

import Stripe from "stripe";

import { hasStripe } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

let client: Stripe | undefined;

/**
 * Stripe client for the configured test-mode key, or null when billing isn't set up. The
 * env schema already refuses live (`sk_live_`) keys, so this can't charge real cards.
 */
export function stripeClient(): Stripe | null {
  const env = serverEnv();
  if (!hasStripe(env)) return null;
  client ??= new Stripe(env.STRIPE_SECRET_KEY!, {
    appInfo: { name: "Relay AI" },
    maxNetworkRetries: 1,
    timeout: 10_000,
  });
  return client;
}

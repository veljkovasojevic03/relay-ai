import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

/**
 * Stripe webhook processing (spec §5.9): signature on the raw body, idempotency through
 * `stripe_events`, the plan derived from the subscription's status. No `server-only`
 * import and no env access, so tests drive it with a real signature and a fake Stripe.
 */

/** The parts of a subscription the app stores. */
export type SubscriptionSnapshot = {
  id: string;
  customerId: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type WebhookDeps = {
  /** Verifies the signature and parses the event (stripe.webhooks.constructEvent). */
  constructEvent: (body: string, signature: string, secret: string) => Stripe.Event;
  /** The subscription's current state, fetched from Stripe. */
  retrieveSubscription: (id: string) => Promise<SubscriptionSnapshot>;
  db: SupabaseClient;
  secret: string;
};

export type WebhookResult = { status: number; body: Record<string, unknown> };

/** Events that change a plan; everything else is acknowledged and ignored. */
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);

/** Billing period end: on current API versions it lives on the subscription's items. */
export function snapshotOf(subscription: Stripe.Subscription): SubscriptionSnapshot {
  const ends = subscription.items.data.map((item) => item.current_period_end).filter(Boolean);
  const end = ends.length ? Math.max(...ends) : null;
  return {
    id: subscription.id,
    customerId: idOf(subscription.customer)!,
    status: subscription.status,
    currentPeriodEnd: end ? new Date(end * 1000).toISOString() : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };
}

export async function handleStripeWebhook(
  body: string,
  signature: string | null,
  deps: WebhookDeps,
): Promise<WebhookResult> {
  if (!signature) return { status: 400, body: { error: "missing_signature" } };

  let event: Stripe.Event;
  try {
    event = deps.constructEvent(body, signature, deps.secret);
  } catch {
    return { status: 400, body: { error: "invalid_signature" } };
  }

  let subscriptionId: string | null = null;
  let profileId: string | null = null;
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription") return ignored(event);
      subscriptionId = idOf(session.subscription);
      profileId = session.client_reference_id;
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      subscriptionId = event.data.object.id;
      break;
    default:
      return ignored(event);
  }
  if (!subscriptionId) return ignored(event);

  // A failure here answers 500, so Stripe retries the event later.
  const subscription = await deps.retrieveSubscription(subscriptionId);
  const { data, error } = await deps.db.rpc("apply_stripe_subscription", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_customer_id: subscription.customerId,
    p_subscription_id: subscription.id,
    p_status: subscription.status,
    p_current_period_end: subscription.currentPeriodEnd,
    p_cancel_at_period_end: subscription.cancelAtPeriodEnd,
    p_profile_id: isUuid(profileId) ? profileId : null,
  });
  if (error) throw new Error(`apply_stripe_subscription failed (${error.code})`);
  return { status: 200, body: { received: true, ...(data as Record<string, unknown>) } };
}

const ignored = (event: Stripe.Event): WebhookResult => ({
  status: 200,
  body: { received: true, status: "ignored", type: event.type },
});

const isUuid = (value: string | null): value is string =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

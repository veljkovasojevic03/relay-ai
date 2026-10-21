import { randomUUID } from "node:crypto";

import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import {
  handleStripeWebhook,
  type SubscriptionSnapshot,
  type WebhookDeps,
} from "@/lib/billing/webhook";

import { adminClient, createBot, createUser, startConversation, type TestUser } from "./helpers";

const db = () => adminClient();
const stripe = new Stripe("sk_test_db");
const SECRET = "whsec_db_test_secret";

/** Stripe as the webhook sees it: the subscriptions it would return, by id. */
function fakeStripe() {
  const subscriptions = new Map<string, SubscriptionSnapshot>();
  const deps: WebhookDeps = {
    constructEvent: (body, sig, key) => stripe.webhooks.constructEvent(body, sig, key),
    retrieveSubscription: async (id) => {
      const sub = subscriptions.get(id);
      if (!sub) throw new Error(`no such subscription ${id}`);
      return sub;
    },
    db: db(),
    secret: SECRET,
  };
  const send = (type: string, object: Record<string, unknown>, id = `evt_${randomUUID()}`) => {
    const payload = JSON.stringify({ id, object: "event", type, data: { object } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    return handleStripeWebhook(payload, signature, deps);
  };
  return { subscriptions, send };
}

const periodEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();

async function profileOf(user: TestUser) {
  const { data } = await db()
    .from("profiles")
    .select(
      "plan, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, subscription_cancel_at_period_end",
    )
    .eq("id", user.id)
    .single();
  return data!;
}

/** Owner who went through Checkout: customer linked, subscription active. */
async function subscribedOwner() {
  const owner = await createUser();
  const stripe = fakeStripe();
  const customerId = `cus_${randomUUID().slice(0, 12)}`;
  const subscriptionId = `sub_${randomUUID().slice(0, 12)}`;
  await db().rpc("link_stripe_customer", { p_profile_id: owner.id, p_customer_id: customerId });
  stripe.subscriptions.set(subscriptionId, {
    id: subscriptionId,
    customerId,
    status: "active",
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
  });
  const result = await stripe.send("checkout.session.completed", {
    object: "checkout.session",
    mode: "subscription",
    customer: customerId,
    subscription: subscriptionId,
    client_reference_id: owner.id,
  });
  expect(result.body).toMatchObject({ status: "applied", plan: "pro" });
  return { owner, stripe, customerId, subscriptionId };
}

describe("Stripe webhook → plan", () => {
  it("upgrades to Pro on a completed checkout and stores the subscription", async () => {
    const { owner, customerId, subscriptionId } = await subscribedOwner();
    expect(await profileOf(owner)).toMatchObject({
      plan: "pro",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: "active",
      subscription_cancel_at_period_end: false,
    });
    expect(new Date((await profileOf(owner)).current_period_end!).toISOString()).toBe(periodEnd);
  });

  it("links a checkout to the profile named in client_reference_id", async () => {
    const owner = await createUser();
    const { subscriptions, send } = fakeStripe();
    subscriptions.set("sub_ref", {
      id: `sub_${owner.id}`,
      customerId: `cus_${owner.id}`,
      status: "active",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });
    const result = await send("checkout.session.completed", {
      object: "checkout.session",
      mode: "subscription",
      subscription: "sub_ref",
      client_reference_id: owner.id,
    });
    expect(result.body).toMatchObject({ status: "applied", plan: "pro" });
    expect((await profileOf(owner)).stripe_customer_id).toBe(`cus_${owner.id}`);
  });

  it("applies a duplicate event only once", async () => {
    const { owner, stripe, subscriptionId } = await subscribedOwner();
    const eventId = `evt_${randomUUID()}`;
    const object = { object: "subscription", id: subscriptionId };

    stripe.subscriptions.get(subscriptionId)!.cancelAtPeriodEnd = true;
    expect(
      (await stripe.send("customer.subscription.updated", object, eventId)).body,
    ).toMatchObject({ status: "applied" });
    // Stripe redelivers the same event after the state moved on: nothing changes.
    stripe.subscriptions.get(subscriptionId)!.status = "canceled";
    const again = await stripe.send("customer.subscription.updated", object, eventId);
    expect(again).toEqual({ status: 200, body: { received: true, status: "duplicate" } });
    expect(await profileOf(owner)).toMatchObject({ plan: "pro", subscription_status: "active" });
  });

  it("keeps Pro until the period ends after a cancellation, then downgrades", async () => {
    const { owner, stripe, subscriptionId } = await subscribedOwner();
    const object = { object: "subscription", id: subscriptionId };

    stripe.subscriptions.get(subscriptionId)!.cancelAtPeriodEnd = true;
    await stripe.send("customer.subscription.updated", object);
    expect(await profileOf(owner)).toMatchObject({
      plan: "pro",
      subscription_cancel_at_period_end: true,
    });

    // At the period end Stripe ends the subscription and sends `deleted`.
    stripe.subscriptions.get(subscriptionId)!.status = "canceled";
    await stripe.send("customer.subscription.deleted", object);
    expect(await profileOf(owner)).toMatchObject({
      plan: "free",
      subscription_status: "canceled",
    });
  });

  it("keeps Pro while a payment is retried, and drops it when the invoice goes unpaid", async () => {
    const { owner, stripe, subscriptionId } = await subscribedOwner();
    const object = { object: "subscription", id: subscriptionId };
    stripe.subscriptions.get(subscriptionId)!.status = "past_due";
    await stripe.send("customer.subscription.updated", object);
    expect((await profileOf(owner)).plan).toBe("pro");
    stripe.subscriptions.get(subscriptionId)!.status = "unpaid";
    await stripe.send("customer.subscription.updated", object);
    expect((await profileOf(owner)).plan).toBe("free");
  });

  it("never lets a late event about an old subscription downgrade a newer one", async () => {
    const { owner, stripe, customerId, subscriptionId: oldId } = await subscribedOwner();
    // Re-subscribed with a new subscription.
    const newId = `sub_${randomUUID().slice(0, 12)}`;
    stripe.subscriptions.set(newId, {
      id: newId,
      customerId,
      status: "active",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });
    await stripe.send("customer.subscription.created", { object: "subscription", id: newId });
    stripe.subscriptions.get(oldId)!.status = "canceled";
    const late = await stripe.send("customer.subscription.deleted", {
      object: "subscription",
      id: oldId,
    });
    expect(late.body).toMatchObject({ status: "stale_subscription" });
    expect(await profileOf(owner)).toMatchObject({ plan: "pro", stripe_subscription_id: newId });
  });

  it("records events for unknown customers without touching any profile", async () => {
    const { subscriptions, send } = fakeStripe();
    subscriptions.set("sub_nobody", {
      id: "sub_nobody",
      customerId: `cus_nobody_${randomUUID()}`,
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    const result = await send("customer.subscription.created", {
      object: "subscription",
      id: "sub_nobody",
    });
    expect(result.body).toMatchObject({ status: "unknown_customer" });
  });

  it("enforces the new plan's quota on the next conversation", async () => {
    const { owner, stripe, subscriptionId } = await subscribedOwner();
    const botId = (await createBot(owner)).id;
    const period = new Date().toISOString().slice(0, 7);
    await db()
      .from("usage_counters")
      .upsert(
        { profile_id: owner.id, period, conversations_started: 50 },
        { onConflict: "profile_id,period" },
      );

    // Pro: 50 used of 1,000.
    expect((await startConversation(botId)).status).toBe("ok");

    stripe.subscriptions.get(subscriptionId)!.status = "canceled";
    await stripe.send("customer.subscription.deleted", {
      object: "subscription",
      id: subscriptionId,
    });
    // Free: 51 used of 50.
    expect((await startConversation(botId)).status).toBe("quota_exceeded");

    const { data } = await owner.client.rpc("my_usage");
    expect(data).toMatchObject({
      plan: "free",
      period,
      conversations: 51,
      conversationLimit: 50,
      bots: 1,
      botLimit: 1,
    });
  });
});

describe("billing functions and columns", () => {
  it("keeps the first Stripe customer when two are linked in parallel", async () => {
    const owner = await createUser();
    const [a, b] = await Promise.all([
      db().rpc("link_stripe_customer", {
        p_profile_id: owner.id,
        p_customer_id: `cus_a_${owner.id}`,
      }),
      db().rpc("link_stripe_customer", {
        p_profile_id: owner.id,
        p_customer_id: `cus_b_${owner.id}`,
      }),
    ]);
    expect([a.error, b.error]).toEqual([null, null]);
    expect(a.data).toBe(b.data);
    expect((await profileOf(owner)).stripe_customer_id).toBe(a.data);
  });

  it("are closed to owners: no self-upgrade through the functions or the new column", async () => {
    const owner = await createUser();
    const apply = await owner.client.rpc("apply_stripe_subscription", {
      p_event_id: `evt_${randomUUID()}`,
      p_event_type: "customer.subscription.updated",
      p_customer_id: "cus_x",
      p_subscription_id: "sub_x",
      p_status: "active",
      p_current_period_end: periodEnd,
      p_cancel_at_period_end: false,
      p_profile_id: owner.id,
    });
    expect(apply.error?.code).toBe("42501");
    const link = await owner.client.rpc("link_stripe_customer", {
      p_profile_id: owner.id,
      p_customer_id: "cus_x",
    });
    expect(link.error?.code).toBe("42501");
    const column = await owner.client
      .from("profiles")
      .update({ subscription_cancel_at_period_end: true })
      .eq("id", owner.id);
    expect(column.error?.code).toBe("42501");
    expect((await profileOf(owner)).plan).toBe("free");
  });
});

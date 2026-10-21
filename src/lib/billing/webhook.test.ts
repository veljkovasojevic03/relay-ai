import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import { handleStripeWebhook, snapshotOf, type WebhookDeps } from "./webhook";

const stripe = new Stripe("sk_test_unit");
const SECRET = "whsec_unit_test_secret";

function signed(event: Record<string, unknown>, secret = SECRET) {
  const payload = JSON.stringify({ object: "event", ...event });
  return { payload, signature: stripe.webhooks.generateTestHeaderString({ payload, secret }) };
}

function deps(overrides: Partial<WebhookDeps> = {}) {
  const rpc = vi.fn();
  return {
    rpc,
    deps: {
      constructEvent: (body: string, sig: string, key: string) =>
        stripe.webhooks.constructEvent(body, sig, key),
      retrieveSubscription: vi.fn(),
      db: { rpc } as unknown as SupabaseClient,
      secret: SECRET,
      ...overrides,
    } satisfies WebhookDeps,
  };
}

describe("handleStripeWebhook", () => {
  it("rejects a missing or wrong signature before touching anything", async () => {
    const { deps: d, rpc } = deps();
    const { payload, signature } = signed({ id: "evt_1", type: "invoice.paid", data: {} });

    expect(await handleStripeWebhook(payload, null, d)).toEqual({
      status: 400,
      body: { error: "missing_signature" },
    });
    const forged = signed({ id: "evt_1", type: "invoice.paid", data: {} }, "whsec_someone_else");
    expect((await handleStripeWebhook(payload, forged.signature, d)).status).toBe(400);
    // A valid signature over a different body.
    expect((await handleStripeWebhook(payload + " ", signature, d)).body).toEqual({
      error: "invalid_signature",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(d.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("acknowledges events it doesn't handle", async () => {
    const { deps: d, rpc } = deps();
    const { payload, signature } = signed({
      id: "evt_2",
      type: "invoice.paid",
      data: { object: {} },
    });
    expect(await handleStripeWebhook(payload, signature, d)).toEqual({
      status: 200,
      body: { received: true, status: "ignored", type: "invoice.paid" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ignores one-off payment checkouts", async () => {
    const { deps: d, rpc } = deps();
    const { payload, signature } = signed({
      id: "evt_3",
      type: "checkout.session.completed",
      data: { object: { object: "checkout.session", mode: "payment", subscription: null } },
    });
    expect((await handleStripeWebhook(payload, signature, d)).body.status).toBe("ignored");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("applies the subscription's current state, not the event's copy", async () => {
    const retrieveSubscription = vi.fn(async () => ({
      id: "sub_1",
      customerId: "cus_1",
      status: "canceled",
      currentPeriodEnd: "2026-11-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    }));
    const { deps: d, rpc } = deps({ retrieveSubscription });
    rpc.mockResolvedValue({ data: { status: "applied", plan: "free" }, error: null });
    const { payload, signature } = signed({
      id: "evt_4",
      type: "customer.subscription.updated",
      data: { object: { object: "subscription", id: "sub_1", status: "active" } },
    });

    const result = await handleStripeWebhook(payload, signature, d);
    expect(result).toEqual({
      status: 200,
      body: { received: true, status: "applied", plan: "free" },
    });
    expect(retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(rpc).toHaveBeenCalledWith("apply_stripe_subscription", {
      p_event_id: "evt_4",
      p_event_type: "customer.subscription.updated",
      p_customer_id: "cus_1",
      p_subscription_id: "sub_1",
      p_status: "canceled",
      p_current_period_end: "2026-11-01T00:00:00.000Z",
      p_cancel_at_period_end: false,
      p_profile_id: null,
    });
  });

  it("passes the checkout's profile id only when it is a UUID", async () => {
    const retrieveSubscription = vi.fn(async () => ({
      id: "sub_2",
      customerId: "cus_2",
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    }));
    const { deps: d, rpc } = deps({ retrieveSubscription });
    rpc.mockResolvedValue({ data: { status: "applied" }, error: null });
    for (const [ref, expected] of [
      ["0f8fad5b-d9cb-469f-a165-70867728950e", "0f8fad5b-d9cb-469f-a165-70867728950e"],
      ["'; drop table profiles; --", null],
    ] as const) {
      const { payload, signature } = signed({
        id: `evt_${ref.length}`,
        type: "checkout.session.completed",
        data: {
          object: {
            object: "checkout.session",
            mode: "subscription",
            subscription: "sub_2",
            client_reference_id: ref,
          },
        },
      });
      await handleStripeWebhook(payload, signature, d);
      expect(rpc.mock.lastCall![1]).toMatchObject({ p_profile_id: expected });
    }
  });

  it("throws on a database error, so the route answers 500 and Stripe retries", async () => {
    const { deps: d, rpc } = deps({
      retrieveSubscription: vi.fn(async () => ({
        id: "sub_3",
        customerId: "cus_3",
        status: "active",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      })),
    });
    rpc.mockResolvedValue({ data: null, error: { code: "57014" } });
    const { payload, signature } = signed({
      id: "evt_5",
      type: "customer.subscription.created",
      data: { object: { object: "subscription", id: "sub_3" } },
    });
    await expect(handleStripeWebhook(payload, signature, d)).rejects.toThrow("57014");
  });
});

describe("snapshotOf", () => {
  it("takes the period end from the subscription's items", () => {
    const snapshot = snapshotOf({
      id: "sub_9",
      customer: { id: "cus_9" },
      status: "active",
      cancel_at_period_end: true,
      items: {
        data: [{ current_period_end: 1_793_491_200 }, { current_period_end: 1_790_000_000 }],
      },
    } as unknown as Stripe.Subscription);
    expect(snapshot).toEqual({
      id: "sub_9",
      customerId: "cus_9",
      status: "active",
      currentPeriodEnd: new Date(1_793_491_200 * 1000).toISOString(),
      cancelAtPeriodEnd: true,
    });
  });
});

import { connection } from "next/server";

import { stripeClient } from "@/lib/billing/stripe";
import { handleStripeWebhook, snapshotOf } from "@/lib/billing/webhook";
import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";
import { supabaseAdmin } from "@/lib/supabase/admin";

const noStore = { "Cache-Control": "no-store" };

/**
 * Stripe → Relay (spec §5.9). The signature is checked on the raw body, so the body is read
 * as text and parsed only by Stripe's verifier.
 */
export async function POST(request: Request) {
  await connection();
  const stripe = stripeClient();
  const db = supabaseAdmin();
  const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
  if (!stripe || !db || !secret) {
    return Response.json({ error: "not_configured" }, { status: 503, headers: noStore });
  }

  const body = await request.text();
  try {
    const result = await handleStripeWebhook(body, request.headers.get("stripe-signature"), {
      constructEvent: (raw, signature, key) => stripe.webhooks.constructEvent(raw, signature, key),
      retrieveSubscription: async (id) => snapshotOf(await stripe.subscriptions.retrieve(id)),
      db,
      secret,
    });
    log.info("stripe.webhook", {
      httpStatus: result.status,
      result: typeof result.body.status === "string" ? result.body.status : "error",
    });
    return Response.json(result.body, { status: result.status, headers: noStore });
  } catch (error) {
    log.error("stripe.webhook_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "processing_failed" }, { status: 500, headers: noStore });
  }
}

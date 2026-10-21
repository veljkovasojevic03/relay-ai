import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { log } from "@/lib/log";

import { callbackBody } from "./contract";
import { lookupDemoOrder } from "./orders";
import { isValidSharedSecret, verifySignature } from "./signing";

/**
 * Endpoints n8n calls (spec §7): the signed callback for async events, and the two pull
 * endpoints guarded by `X-Relay-Secret`. Handlers take the database and secret as
 * arguments so the DB tests can drive them directly.
 */

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

const MAX_BODY_BYTES = 2048;

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * POST /api/n8n/callback: n8n reports `sent` or `failed` for an escalation or reply email.
 * Signed like app → n8n calls; stale timestamps and bad signatures are refused, a replayed
 * eventId is acknowledged with no effect.
 */
export async function handleCallback(
  request: Request,
  db: SupabaseClient,
  secret: string,
  now = Date.now(),
): Promise<Response> {
  const body = callbackBody.safeParse(await readJson(request));
  const verified = verifySignature({
    secret,
    timestamp: request.headers.get("x-relay-timestamp"),
    signature: request.headers.get("x-relay-signature"),
    // A malformed body has no trustworthy eventId: that is a bad request.
    eventId: body.success ? body.data.eventId : null,
    now,
  });
  if (!verified.ok || !body.success) {
    const reason = verified.ok ? "bad_request" : verified.error;
    log.warn("n8n.callback_rejected", { reason });
    return json({ ok: false, error: reason }, reason === "bad_request" ? 400 : 401);
  }
  const { eventId, status, error } = body.data;

  const { data, error: dbError } = await db.rpc("apply_n8n_callback", {
    p_event_id: eventId,
    p_status: status,
    p_error: error ?? null,
  });
  if (dbError) {
    log.error("n8n.callback_failed", { code: dbError.code });
    return json({ ok: false, error: "internal" }, 500);
  }
  const result = (data as { result: "applied" | "replayed" | "unknown_event" }).result;
  log.info("n8n.callback", { result, status });
  if (result === "unknown_event") return json({ ok: false, error: "unknown_event" }, 404);
  return json({ ok: true, result });
}

const orderQuery = z.object({
  orderNumber: z.string().trim().min(1).max(32),
  email: z.string().trim().max(254),
});

/**
 * GET|POST /api/demo/orders/lookup: n8n's order_status workflow asks the app. Same
 * `{found: false}` for a missing order and a wrong email (spec §4.7).
 */
export async function handleOrderLookup(
  request: Request,
  db: SupabaseClient,
  secret: string | undefined,
): Promise<Response> {
  if (!isValidSharedSecret(request.headers.get("x-relay-secret"), secret)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const input =
    request.method === "GET"
      ? Object.fromEntries(new URL(request.url).searchParams)
      : await readJson(request);
  const parsed = orderQuery.safeParse(input);
  if (!parsed.success) return json({ ok: false, error: "bad_request" }, 400);
  try {
    return json(await lookupDemoOrder(db, parsed.data.orderNumber, parsed.data.email));
  } catch {
    return json({ ok: false, error: "internal" }, 500);
  }
}

/** `7d`, `1d`, `30d`: whole days, 1 to 31. */
const periodParam = z
  .string()
  .regex(/^([1-9]|[12][0-9]|3[01])d$/)
  .transform((v) => Number(v.slice(0, -1)));

/**
 * GET /api/n8n/digest?period=7d: numbers for the weekly digest workflow, only for owners who
 * turned `weekly_digest` on. An empty `owners` list is a normal answer.
 */
export async function handleDigest(
  request: Request,
  db: SupabaseClient,
  secret: string | undefined,
  now = new Date(),
): Promise<Response> {
  if (!isValidSharedSecret(request.headers.get("x-relay-secret"), secret)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  const period = periodParam.safeParse(new URL(request.url).searchParams.get("period") ?? "7d");
  if (!period.success) return json({ ok: false, error: "bad_request" }, 400);
  const from = new Date(now.getTime() - period.data * 86_400_000);

  const { data, error } = await db.rpc("digest_stats", { p_since: from.toISOString() });
  if (error) {
    log.error("n8n.digest_failed", { code: error.code });
    return json({ ok: false, error: "internal" }, 500);
  }
  return json({
    ok: true,
    period: { days: period.data, from: from.toISOString(), to: now.toISOString() },
    owners: data ?? [],
  });
}

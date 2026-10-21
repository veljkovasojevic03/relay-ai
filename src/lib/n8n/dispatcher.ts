import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import { serverEnv } from "@/lib/env.server";

import {
  ACTION_RESULT_SCHEMAS,
  ACTION_TIMEOUT_MS,
  actionResponseSchema,
  DELIVERY_TIMEOUT_MS,
  ticketReference,
  WEBHOOK_PATHS,
  type ActionEventType,
  type Envelope,
} from "./contract";
import { lookupDemoOrder } from "./orders";
import { signedHeaders } from "./signing";

/**
 * Delivery of n8n-bound events (spec §8). Two implementations behind one interface:
 * `real` calls Veljko's local n8n with signed requests; `simulated` (the default, and always
 * the case on Vercel) computes the same results in-process.
 */

export type DeliveryOutcome =
  /** n8n accepted the event; its callback reports the final result. */
  | { kind: "accepted" }
  /** No n8n: the event is recorded as "would have been sent". */
  | { kind: "simulated" }
  /** Not delivered (network, timeout, non-2xx); the outbox retries later. */
  | { kind: "retry"; error: string };

export type ActionOutcome =
  | { ok: true; result: unknown; simulated: boolean }
  | { ok: false; error: string; simulated: boolean };

export interface N8nDispatcher {
  readonly mode: "real" | "simulated";
  /** Async events (escalation, reply_email): hand over and return. */
  deliver(event: Envelope): Promise<DeliveryOutcome>;
  /** Sync actions: wait for the result (at most ACTION_TIMEOUT_MS in real mode). */
  runAction(event: Envelope & { type: ActionEventType }): Promise<ActionOutcome>;
}

type Fetch = typeof fetch;

export function createRealDispatcher(options: {
  base: string;
  secret: string;
  fetch?: Fetch;
  now?: () => number;
}): N8nDispatcher {
  const base = options.base.replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;

  async function post(event: Envelope, timeoutMs: number) {
    return doFetch(`${base}/${WEBHOOK_PATHS[event.type]}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...signedHeaders(options.secret, event.eventId, now()),
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
      cache: "no-store",
    });
  }

  return {
    mode: "real",

    async deliver(event) {
      let response: Response;
      try {
        response = await post(event, DELIVERY_TIMEOUT_MS);
      } catch (error) {
        return { kind: "retry", error: fetchError(error) };
      }
      // Drain the body so the connection is released; its content doesn't matter beyond 2xx.
      await response.text().catch(() => "");
      return response.ok
        ? { kind: "accepted" }
        : { kind: "retry", error: `http_${response.status}` };
    },

    async runAction(event) {
      let response: Response;
      try {
        response = await post(event, ACTION_TIMEOUT_MS);
      } catch (error) {
        return { ok: false, error: fetchError(error), simulated: false };
      }
      const body: unknown = await response.json().catch(() => null);
      const schema: z.ZodType = actionResponseSchema(ACTION_RESULT_SCHEMAS[event.type]);
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        return {
          ok: false,
          error: response.ok ? "malformed_response" : `http_${response.status}`,
          simulated: false,
        };
      }
      const data = parsed.data as { ok: true; result: unknown } | { ok: false; error: string };
      if (!data.ok) return { ok: false, error: data.error, simulated: false };
      if (!response.ok) return { ok: false, error: `http_${response.status}`, simulated: false };
      return { ok: true, result: data.result, simulated: false };
    },
  };
}

function fetchError(error: unknown): string {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "timeout";
  }
  return "network";
}

export function createSimulatedDispatcher(db: SupabaseClient): N8nDispatcher {
  return {
    mode: "simulated",
    async deliver() {
      return { kind: "simulated" };
    },
    async runAction(event) {
      try {
        if (event.type === "action.order_status") {
          const params = (event.data.params ?? {}) as { orderNumber?: string; email?: string };
          const result = await lookupDemoOrder(db, params.orderNumber ?? "", params.email ?? "");
          return { ok: true, result, simulated: true };
        }
        return { ok: true, result: { ticketRef: ticketReference() }, simulated: true };
      } catch {
        return { ok: false, error: "upstream_error", simulated: true };
      }
    },
  };
}

/** The dispatcher for the configured N8N_MODE (spec §8: simulated unless a base is set). */
export function n8nDispatcher(db: SupabaseClient): N8nDispatcher {
  const env = serverEnv();
  if (env.N8N_MODE === "real" && env.N8N_WEBHOOK_BASE && env.N8N_SHARED_SECRET) {
    return createRealDispatcher({ base: env.N8N_WEBHOOK_BASE, secret: env.N8N_SHARED_SECRET });
  }
  return createSimulatedDispatcher(db);
}

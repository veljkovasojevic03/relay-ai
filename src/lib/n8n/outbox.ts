import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "@/lib/log";

import {
  envelope,
  type ActionEventType,
  type Envelope,
  type EnvelopeParts,
  type EventType,
} from "./contract";
import type { ActionOutcome, N8nDispatcher } from "./dispatcher";

/**
 * Delivery of `n8n_outbox` rows (spec §8). Async events are written by the same SQL
 * transaction that changes a chat (Phase 6); this module sends them, retries with backoff,
 * and records sync action calls so the Event log shows every n8n-bound event.
 */

/** Wait before attempt n+1, after n failed attempts. The cron tick runs hourly. */
export const RETRY_DELAYS_SECONDS = [60, 5 * 60, 30 * 60, 2 * 3600, 6 * 3600];
/** Attempts before an event is marked failed for good. */
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length;
/** How long a claimed row stays reserved for the worker that claimed it. */
const LEASE_SECONDS = 60;

export function retryDelaySeconds(attempts: number): number {
  return RETRY_DELAYS_SECONDS[Math.min(Math.max(attempts, 1), MAX_ATTEMPTS) - 1]!;
}

type OutboxRow = {
  id: string;
  event_id: string;
  type: EventType;
  payload: EnvelopeParts;
  attempts: number;
  created_at: string;
};

export function rowEnvelope(row: OutboxRow): Envelope {
  return envelope(row.event_id, row.type, row.created_at, row.payload);
}

export type FlushResult = {
  claimed: number;
  accepted: number;
  simulated: number;
  retrying: number;
  failed: number;
};

/** Sends due async events. Safe to run concurrently (rows are claimed with a lease). */
export async function flushOutbox(
  db: SupabaseClient,
  dispatcher: N8nDispatcher,
  limit = 10,
): Promise<FlushResult> {
  const result: FlushResult = { claimed: 0, accepted: 0, simulated: 0, retrying: 0, failed: 0 };
  const { data, error } = await db.rpc("claim_outbox", {
    p_limit: limit,
    p_lease_seconds: LEASE_SECONDS,
  });
  if (error) {
    log.error("outbox.claim_failed", { code: error.code });
    return result;
  }
  const rows = (data ?? []) as OutboxRow[];
  result.claimed = rows.length;

  for (const row of rows) {
    const outcome = await dispatcher.deliver(rowEnvelope(row));
    const now = new Date().toISOString();
    let update: Record<string, unknown>;
    if (outcome.kind === "accepted") {
      update = { status: "delivered", delivered_at: now, last_error: null };
      result.accepted++;
    } else if (outcome.kind === "simulated") {
      update = { status: "simulated", delivered_at: now, last_error: null };
      result.simulated++;
    } else if (row.attempts >= MAX_ATTEMPTS) {
      update = { status: "failed", last_error: outcome.error };
      result.failed++;
    } else {
      const retryAt = new Date(Date.now() + retryDelaySeconds(row.attempts) * 1000);
      update = { last_error: outcome.error, next_attempt_at: retryAt.toISOString() };
      result.retrying++;
    }
    // Only while still pending: n8n's callback may already have marked it sent or failed.
    const { error: updateError } = await db
      .from("n8n_outbox")
      .update(update)
      .eq("id", row.id)
      .eq("status", "pending");
    if (updateError) log.error("outbox.update_failed", { code: updateError.code });
    log.info("outbox.delivery", {
      type: row.type,
      outcome: outcome.kind,
      attempts: row.attempts,
      ...(outcome.kind === "retry" ? { error: outcome.error } : {}),
    });
  }
  return result;
}

/**
 * Runs a sync action through the dispatcher and records it in the outbox with its final
 * status. `storedData` is what the Event log keeps (PII-minimal); `data` is what n8n gets.
 */
export async function runActionEvent(
  db: SupabaseClient,
  dispatcher: N8nDispatcher,
  input: {
    ownerId: string;
    type: ActionEventType;
    parts: EnvelopeParts;
    storedData: Record<string, unknown>;
  },
): Promise<ActionOutcome & { eventId: string | null }> {
  const { data: row, error } = await db
    .from("n8n_outbox")
    .insert({
      owner_id: input.ownerId,
      type: input.type,
      payload: { ...input.parts, data: input.storedData },
      attempts: 1,
    })
    .select("id, event_id, created_at")
    .single();
  if (error || !row) {
    log.error("outbox.action_insert_failed", { code: error?.code ?? null });
    return {
      ok: false,
      error: "internal",
      simulated: dispatcher.mode === "simulated",
      eventId: null,
    };
  }

  const event = envelope(row.event_id, input.type, row.created_at, input.parts);
  const outcome = await dispatcher.runAction({ ...event, type: input.type });
  const status = outcome.simulated ? "simulated" : outcome.ok ? "sent" : "failed";
  const { error: updateError } = await db
    .from("n8n_outbox")
    .update({
      status,
      delivered_at: outcome.ok ? new Date().toISOString() : null,
      last_error: outcome.ok ? null : outcome.error.slice(0, 500),
    })
    .eq("id", row.id);
  if (updateError) log.error("outbox.update_failed", { code: updateError.code });
  log.info("outbox.action", { type: input.type, ok: outcome.ok, simulated: outcome.simulated });
  return { ...outcome, eventId: row.event_id };
}

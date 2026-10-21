import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Language } from "@/lib/bots/schema";
import { log } from "@/lib/log";
import type { CreateTicketResult, OrderStatusResult } from "@/lib/n8n/contract";
import type { N8nDispatcher } from "@/lib/n8n/dispatcher";
import { runActionEvent } from "@/lib/n8n/outbox";
import { cleanText, eventContext } from "@/lib/widget/handoff";

import { ACTION_COPY } from "./copy";
import {
  cardFields,
  type ActionCard,
  maskEmail,
  type ActionParams,
  type CreateTicketParams,
  type OrderStatusParams,
} from "./flow";

/**
 * Action runs (spec §4.7): created as `pending_confirmation` when a guided flow has all its
 * values, executed only after the visitor confirms the card. Every run is logged in
 * `action_runs`; a failure gives a friendly message and offers a person.
 */

export async function createPendingRun(
  db: SupabaseClient,
  input: { botId: string; conversationId: string; simulated: boolean } & ActionParams,
): Promise<ActionCard> {
  const { data, error } = await db
    .from("action_runs")
    .insert({
      conversation_id: input.conversationId,
      bot_id: input.botId,
      action_name: input.action,
      params: input.params,
      status: "pending_confirmation",
      simulated: input.simulated,
    })
    .select("id")
    .single();
  if (error || !data) {
    log.error("actions.create_failed", { code: error?.code ?? null });
    throw new Error("action run create failed");
  }
  return {
    actionRunId: data.id,
    action: input.action,
    fields: cardFields(input),
    simulated: input.simulated,
  };
}

/** A new visitor message means the visitor moved on: an unconfirmed card no longer counts. */
export async function cancelPendingRuns(
  db: SupabaseClient,
  botId: string,
  conversationId: string,
): Promise<void> {
  const { error } = await db
    .from("action_runs")
    .update({ status: "cancelled" })
    .eq("conversation_id", conversationId)
    .eq("bot_id", botId)
    .eq("status", "pending_confirmation");
  if (error) log.error("actions.cancel_failed", { code: error.code });
}

/** The newest unconfirmed card of a conversation, so a refreshed widget shows it again. */
export async function pendingCard(
  db: SupabaseClient,
  botId: string,
  conversationId: string,
  simulated: boolean,
): Promise<ActionCard | null> {
  const { data } = await db
    .from("action_runs")
    .select("id, action_name, params")
    .eq("conversation_id", conversationId)
    .eq("bot_id", botId)
    .eq("status", "pending_confirmation")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const parsed = runParams(data.action_name, data.params);
  if (!parsed) return null;
  return { actionRunId: data.id, action: parsed.action, fields: cardFields(parsed), simulated };
}

const orderParams = z.object({ orderNumber: z.string(), email: z.string() });
const ticketParams = z.object({
  subject: z.string(),
  description: z.string(),
  visitorEmail: z.string().optional(),
});

function runParams(action: string, params: unknown): ActionParams | null {
  if (action === "order_status") {
    const p = orderParams.safeParse(params);
    return p.success ? { action, params: p.data } : null;
  }
  if (action === "create_ticket") {
    const p = ticketParams.safeParse(params);
    return p.success ? { action, params: p.data } : null;
  }
  return null;
}

export type DecisionResult =
  | { status: "not_pending" }
  | {
      status: "succeeded" | "failed" | "cancelled";
      message: string;
      messageId: string | null;
      simulated: boolean;
      offerHuman: boolean;
    };

/**
 * The visitor's answer to a confirmation card. The pending → confirmed/cancelled switch is
 * one conditional UPDATE, so a double click or two tabs can run an action at most once.
 */
export async function decideRun(
  db: SupabaseClient,
  dispatcher: N8nDispatcher,
  input: {
    runId: string;
    botId: string;
    ownerId: string;
    conversationId: string;
    decision: "confirm" | "cancel";
    language: Language;
  },
): Promise<DecisionResult> {
  const copy = ACTION_COPY[input.language];
  const { data: run, error } = await db
    .from("action_runs")
    .update({ status: input.decision === "confirm" ? "confirmed" : "cancelled" })
    .eq("id", input.runId)
    .eq("conversation_id", input.conversationId)
    .eq("bot_id", input.botId)
    .eq("status", "pending_confirmation")
    .select("id, action_name, params")
    .maybeSingle();
  if (error) {
    log.error("actions.decide_failed", { code: error.code });
    throw new Error("action decision failed");
  }
  if (!run) return { status: "not_pending" };
  const simulated = dispatcher.mode === "simulated";

  if (input.decision === "cancel") {
    const messageId = await recordResult(db, input, copy.declined, {
      action: run.action_name,
      outcome: "cancelled",
      simulated: false,
    });
    return {
      status: "cancelled",
      message: copy.declined,
      messageId,
      simulated: false,
      offerHuman: false,
    };
  }

  const params = runParams(run.action_name, run.params);
  const started = performance.now();
  await db.from("action_runs").update({ status: "running" }).eq("id", run.id);

  let outcome:
    { ok: true; message: string; result: Record<string, unknown> } | { ok: false; error: string };
  let ranSimulated = simulated;
  if (!params) {
    outcome = { ok: false, error: "invalid_params" };
  } else {
    const context = await eventContext(db, input.botId);
    const sent = await runActionEvent(db, dispatcher, {
      ownerId: input.ownerId,
      type: params.action === "order_status" ? "action.order_status" : "action.create_ticket",
      parts: { ...context, data: eventData(run.id, input.conversationId, params, false) },
      storedData: eventData(run.id, input.conversationId, params, true),
    });
    ranSimulated = sent.simulated;
    outcome = sent.ok
      ? await applyResult(db, input, params, sent.result)
      : { ok: false, error: sent.error };
  }

  const durationMs = Math.round(performance.now() - started);
  const message = outcome.ok ? outcome.message : copy.failed;
  await db
    .from("action_runs")
    .update({
      status: outcome.ok ? "succeeded" : "failed",
      result: outcome.ok ? outcome.result : null,
      error: outcome.ok ? null : outcome.error.slice(0, 500),
      simulated: ranSimulated,
      duration_ms: durationMs,
      // PII-minimal once done: the owner sees whose request it was, not the full address.
      params: params ? storedParams(params) : {},
    })
    .eq("id", run.id);
  log.info("actions.run", {
    action: run.action_name,
    ok: outcome.ok,
    simulated: ranSimulated,
    durationMs,
    ...(outcome.ok ? {} : { error: outcome.error }),
  });

  const messageId = await recordResult(db, input, message, {
    action: run.action_name,
    outcome: outcome.ok ? "succeeded" : "failed",
    simulated: ranSimulated,
  });
  return {
    status: outcome.ok ? "succeeded" : "failed",
    message,
    messageId,
    simulated: ranSimulated,
    offerHuman: !outcome.ok,
  };
}

function eventData(
  runId: string,
  conversationId: string,
  params: ActionParams,
  masked: boolean,
): Record<string, unknown> {
  if (params.action === "order_status") {
    return { actionRunId: runId, params: masked ? storedParams(params) : params.params };
  }
  return {
    actionRunId: runId,
    conversationId,
    params: masked ? storedParams(params) : ticketPayload(params.params),
  };
}

function ticketPayload(p: CreateTicketParams) {
  return {
    subject: cleanText(p.subject, 200),
    description: cleanText(p.description, 4000),
    ...(p.visitorEmail ? { visitorEmail: p.visitorEmail } : {}),
  };
}

function storedParams(params: ActionParams): Record<string, unknown> {
  if (params.action === "order_status") {
    const p: OrderStatusParams = params.params;
    return { orderNumber: p.orderNumber, email: maskEmail(p.email) };
  }
  const p = ticketPayload(params.params);
  return { ...p, ...(p.visitorEmail ? { visitorEmail: maskEmail(p.visitorEmail) } : {}) };
}

async function applyResult(
  db: SupabaseClient,
  input: { botId: string; conversationId: string; language: Language },
  params: ActionParams,
  result: unknown,
): Promise<
  { ok: true; message: string; result: Record<string, unknown> } | { ok: false; error: string }
> {
  const copy = ACTION_COPY[input.language];
  if (params.action === "order_status") {
    const r = result as OrderStatusResult;
    if (!r.found) return { ok: true, message: copy.orderNotFound, result: { found: false } };
    return {
      ok: true,
      message: copy.order({
        orderNumber: params.params.orderNumber,
        status: r.status,
        eta: r.eta ?? null,
        items: r.items,
      }),
      result: { found: true, status: r.status },
    };
  }

  const { ticketRef } = result as CreateTicketResult;
  const ticket = ticketPayload(params.params);
  const { error } = await db.from("tickets").insert({
    bot_id: input.botId,
    conversation_id: input.conversationId,
    subject: ticket.subject,
    description: ticket.description,
    visitor_email: ticket.visitorEmail ?? null,
    reference: ticketRef,
  });
  if (error) {
    // 23505: n8n handed out a reference that already exists (random refs can collide).
    log.error("actions.ticket_insert_failed", { code: error.code });
    return {
      ok: false,
      error: error.code === "23505" ? "duplicate_reference" : "ticket_store_failed",
    };
  }
  return {
    ok: true,
    message: copy.ticketCreated(ticketRef, Boolean(ticket.visitorEmail)),
    result: { ticketRef },
  };
}

async function recordResult(
  db: SupabaseClient,
  input: { botId: string; conversationId: string; language: Language },
  content: string,
  meta: { action: string; outcome: string; simulated: boolean },
): Promise<string | null> {
  const { data, error } = await db.rpc("record_bot_reply", {
    p_conversation_id: input.conversationId,
    p_bot_id: input.botId,
    p_content: content,
    p_source_faq_ids: [],
    p_meta: { mode: "sample", kind: "action_result", ...meta },
    p_outcome: "flow",
    p_question: "",
    p_language: input.language,
    p_first_response_ms: 0,
  });
  if (error) {
    log.error("actions.result_store_failed", { code: error.code });
    return null;
  }
  return (data as { message_id: string }).message_id;
}

import "server-only";

import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ACTION_NAMES, type ActionName } from "./flow";
import { actionAllowedFor } from "./registry";

/** Dashboard reads for actions and the Event log. All through RLS as the signed-in owner. */

export type BotAction = {
  name: ActionName;
  enabled: boolean;
  /** False when this bot may not offer it (order_status outside the demo bot). */
  available: boolean;
  requiresConfirmation: boolean;
};

export type ActionRun = {
  id: string;
  action: string;
  status: "pending_confirmation" | "confirmed" | "running" | "succeeded" | "failed" | "cancelled";
  simulated: boolean;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
};

export async function getBotActions(
  botId: string,
): Promise<{ actions: BotAction[]; runs: ActionRun[] }> {
  await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  const [bot, registry, toggles, runs] = await Promise.all([
    supabase.from("bots").select("is_demo").eq("id", botId).single(),
    supabase.from("actions").select("id, name, requires_confirmation"),
    supabase.from("bot_actions").select("action_id, enabled").eq("bot_id", botId),
    supabase
      .from("action_runs")
      .select("id, action_name, status, simulated, duration_ms, error, created_at")
      .eq("bot_id", botId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (bot.error || registry.error || toggles.error || runs.error) {
    throw new Error("Could not load actions");
  }
  const isDemo = bot.data.is_demo === true;
  const enabled = new Set(toggles.data.filter((t) => t.enabled).map((t) => t.action_id));
  const known = new Map(registry.data.map((a) => [a.name, a]));

  return {
    actions: ACTION_NAMES.flatMap((name) => {
      const row = known.get(name);
      if (!row) return [];
      const available = actionAllowedFor(name, { isDemo });
      return [
        {
          name,
          enabled: available && enabled.has(row.id),
          available,
          requiresConfirmation: row.requires_confirmation,
        },
      ];
    }),
    runs: runs.data.map((r) => ({
      id: r.id,
      action: r.action_name,
      status: r.status as ActionRun["status"],
      simulated: r.simulated,
      durationMs: r.duration_ms,
      error: r.error,
      createdAt: r.created_at,
    })),
  };
}

export const EVENT_STATUSES = ["pending", "delivered", "sent", "failed", "simulated"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export type OutboxEvent = {
  id: string;
  type: "escalation" | "reply_email" | "action.order_status" | "action.create_ticket";
  status: EventStatus;
  botName: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
  nextAttemptAt: string;
};

const eventFilter = z.enum(EVENT_STATUSES).optional().catch(undefined);

export function parseEventFilter(raw: unknown): EventStatus | undefined {
  return eventFilter.parse(typeof raw === "string" ? raw : undefined);
}

/** The owner's n8n-bound events, newest first. The payload itself is never shown. */
export async function listEvents(status?: EventStatus): Promise<OutboxEvent[]> {
  await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  let query = supabase
    .from("n8n_outbox")
    .select(
      "id, type, status, bot_name:payload->bot->>name, attempts, last_error, created_at, delivered_at, next_attempt_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error("Could not load events");
  return data.map((r) => ({
    id: r.id,
    type: r.type as OutboxEvent["type"],
    status: r.status as EventStatus,
    botName: typeof r.bot_name === "string" ? r.bot_name : null,
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at,
    nextAttemptAt: r.next_attempt_at,
  }));
}

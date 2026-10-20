import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Language } from "@/lib/bots/schema";
import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";

import { BOT_COPY } from "./copy";

/**
 * Handing a chat to the owner (spec §4.6) and the n8n event bodies that go with it (§8).
 * Events are written to `n8n_outbox` by the same SQL transaction that changes the chat;
 * Phase 7 delivers them (or simulates delivery).
 */

export type HandoffReason = "unknown_twice" | "requested" | "action_failed";

/** Event-body text: control characters dropped, length capped. JSON does the escaping. */
export function cleanText(text: string, max = 500): string {
  const cleaned = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

export type EventContext = {
  bot: { id: string; name: string };
  owner: { notificationEmail: string | null; language: Language };
};

/** The `bot` and `owner` parts of every event envelope. */
export async function eventContext(db: SupabaseClient, botId: string): Promise<EventContext> {
  const { data, error } = await db
    .from("bots")
    .select("id, name, profiles!inner(notification_email, ui_language)")
    .eq("id", botId)
    .single();
  if (error || !data) throw new Error("event context lookup failed");
  const profile = (Array.isArray(data.profiles) ? data.profiles[0] : data.profiles) as {
    notification_email: string | null;
    ui_language: string;
  };
  return {
    bot: { id: data.id, name: cleanText(data.name, 80) },
    owner: {
      notificationEmail: profile.notification_email,
      language: profile.ui_language === "sr" ? "sr" : "en",
    },
  };
}

/** Link the owner opens from the email, in their dashboard language. */
export function inboxUrl(language: Language, conversationId: string): string {
  const base = serverEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}${language === "sr" ? "/sr" : ""}/dashboard/inbox/${conversationId}`;
}

async function lastMessages(db: SupabaseClient, botId: string, conversationId: string) {
  const { data } = await db
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .eq("bot_id", botId)
    .order("created_at", { ascending: false })
    .limit(6);
  return ((data ?? []) as { role: string; content: string }[])
    .reverse()
    .map((m) => ({ role: m.role, text: cleanText(m.content) }));
}

export type HandoffResult = {
  status: "handed_off" | "already" | "closed" | "not_found";
  /** The system message shown to the visitor (only when this call handed off)... */
  message: string | null;
  /** ...and its id, so the widget doesn't show it twice when polling. */
  messageId: string | null;
};

export async function startHandoff(
  db: SupabaseClient,
  input: {
    botId: string;
    conversationId: string;
    reason: HandoffReason;
    email: string | null;
    language: Language;
  },
): Promise<HandoffResult> {
  const [context, messages] = await Promise.all([
    eventContext(db, input.botId),
    lastMessages(db, input.botId, input.conversationId),
  ]);
  const message = BOT_COPY[input.language].handoff(context.bot.name);

  const { data, error } = await db.rpc("request_handoff", {
    p_conversation_id: input.conversationId,
    p_bot_id: input.botId,
    p_reason: input.reason,
    p_email: input.email,
    p_system_message: message,
    p_escalation: {
      ...context,
      data: {
        lastMessages: messages,
        inboxUrl: inboxUrl(context.owner.language, input.conversationId),
      },
    },
  });
  if (error) {
    log.error("widget.handoff_failed", { code: error.code });
    throw new Error("handoff failed");
  }
  const { status, message_id: messageId } = data as {
    status: HandoffResult["status"];
    message_id?: string;
  };
  if (status === "handed_off") {
    log.info("widget.handed_off", { botId: input.botId, reason: input.reason });
  }
  const handedOff = status === "handed_off";
  return {
    status,
    message: handedOff ? message : null,
    messageId: handedOff ? (messageId ?? null) : null,
  };
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { enabledActions } from "@/lib/actions/registry";
import { decideRun, pendingCard } from "@/lib/actions/run";
import { logoPublicUrl } from "@/lib/bots/logo";
import { parseFeaturedQuestions, parseGreeting } from "@/lib/bots/schema";
import { readableForeground } from "@/lib/design/contrast";
import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";
import { n8nDispatcher } from "@/lib/n8n/dispatcher";
import { isWithinKeyedRateLimit } from "@/lib/security/rate-limit";

import {
  findConversation,
  loadBot,
  readJsonBody,
  visitorIpHash,
  widgetError,
  widgetJson,
  widgetOrigin,
  type WidgetBot,
  type WidgetConversation,
} from "./context";
import type { OriginCheck } from "./cors";
import { MAX_BODY_BYTES, MAX_VISITOR_MESSAGES, WIDGET_RATE_LIMITS } from "./limits";
import { startHandoff, type HandoffReason } from "./handoff";
import { LIVE_MODE_IMPLEMENTED } from "./mode";

/**
 * The small widget endpoints (spec §7): config, poll, rate, end. Message streaming lives in
 * message.ts. Each resolves bot → origin → (token → conversation) before touching data.
 */

type Resolved =
  { ok: true; bot: WidgetBot; origin: OriginCheck } | { ok: false; response: Response };

async function resolveBot(db: SupabaseClient, request: Request, key: unknown): Promise<Resolved> {
  const bot = await loadBot(db, key);
  if (!bot) return { ok: false, response: widgetError("bot_not_found", 404) };
  const origin = widgetOrigin(request, bot);
  if (origin.kind === "denied") {
    return { ok: false, response: widgetError("origin_not_allowed", 403) };
  }
  return { ok: true, bot, origin };
}

type WithConversation =
  | { ok: true; bot: WidgetBot; origin: OriginCheck; conversation: WidgetConversation }
  | { ok: false; response: Response };

async function resolveConversation(
  db: SupabaseClient,
  request: Request,
  key: unknown,
  rule: (typeof WIDGET_RATE_LIMITS)[keyof typeof WIDGET_RATE_LIMITS],
): Promise<WithConversation> {
  const resolved = await resolveBot(db, request, key);
  if (!resolved.ok) return resolved;
  const { bot, origin } = resolved;
  const conversation = await findConversation(db, bot.id, request.headers.get("x-relay-token"));
  if (!conversation) return { ok: false, response: widgetError("invalid_token", 401, origin) };
  if (!(await isWithinKeyedRateLimit(rule, conversation.id))) {
    return {
      ok: false,
      response: widgetError("rate_limited", 429, origin, {
        "Retry-After": String(rule.windowSeconds),
      }),
    };
  }
  return { ok: true, bot, origin, conversation };
}

/** GET /api/widget/config?bot=<public_key>: public settings only. */
export async function handleConfig(request: Request, db: SupabaseClient): Promise<Response> {
  const key = new URL(request.url).searchParams.get("bot");
  const ipHash = visitorIpHash(request);
  if (ipHash && !(await isWithinKeyedRateLimit(WIDGET_RATE_LIMITS.config, ipHash))) {
    return widgetError("rate_limited", 429, { kind: "none" }, { "Retry-After": "60" });
  }
  const resolved = await resolveBot(db, request, key);
  if (!resolved.ok) return resolved.response;
  const { bot, origin } = resolved;

  const [{ data: accepts, error }, actions] = await Promise.all([
    db.rpc("bot_accepts_conversations", { p_bot_id: bot.id }),
    enabledActions(db, bot),
  ]);
  if (error) log.error("widget.availability_failed", { code: error.code });

  return widgetJson(
    {
      name: bot.name,
      brandColor: bot.brandColor,
      foreground: readableForeground(bot.brandColor).color,
      logoUrl: logoPublicUrl(serverEnv().NEXT_PUBLIC_SUPABASE_URL ?? "", bot.logoPath),
      greeting: parseGreeting(bot.greeting),
      position: bot.position,
      questions: parseFeaturedQuestions(bot.featuredQuestions),
      defaultLanguage: bot.defaultLanguage,
      // New chats can start. An existing chat may continue while this is false.
      available: bot.active && accepts === true,
      mode: LIVE_MODE_IMPLEMENTED ? "live" : "sample",
      // Actions this bot offers; the widget shows a quick-start chip for each.
      actions,
      // Public values (the browser-safe key), so the widget can hear "reply waiting" pings.
      realtime: realtimeConfig(),
    },
    origin,
    // Short, so settings changes show up quickly; Vary: Origin keeps caches per site.
    "public, max-age=30",
  );
}

type MessageRow = {
  id: string;
  role: string;
  content: string;
  source_faq_ids: string[];
  meta: { mode?: string; simulated?: boolean } | null;
  created_at: string;
};

/**
 * GET /api/widget/conversation?bot=: the whole conversation, so a refreshed page resumes
 * where it left off. Sources are resolved to their questions within this bot only; an FAQ
 * deleted since simply drops out of the label.
 */
export async function handleConversation(request: Request, db: SupabaseClient): Promise<Response> {
  const url = new URL(request.url);
  const resolved = await resolveConversation(
    db,
    request,
    url.searchParams.get("bot"),
    WIDGET_RATE_LIMITS.poll,
  );
  if (!resolved.ok) return resolved.response;
  const { origin, conversation, bot } = resolved;

  const { data, error } = await db
    .from("messages")
    .select("id, role, content, source_faq_ids, meta, created_at")
    .eq("conversation_id", conversation.id)
    .eq("bot_id", bot.id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    log.error("widget.history_failed", { code: error.code });
    return widgetError("internal", 500, origin);
  }
  const rows = data as MessageRow[];
  const card =
    conversation.status === "bot"
      ? await pendingCard(db, bot.id, conversation.id, serverEnv().N8N_MODE === "simulated")
      : null;

  const faqIds = [...new Set(rows.flatMap((m) => m.source_faq_ids ?? []))];
  const questions = new Map<string, string>();
  if (faqIds.length) {
    const faqs = await db.from("faqs").select("id, question").eq("bot_id", bot.id).in("id", faqIds);
    for (const f of (faqs.data ?? []) as { id: string; question: string }[]) {
      questions.set(f.id, f.question);
    }
  }

  return widgetJson(
    {
      status: conversation.status,
      rating: conversation.rating,
      channel: conversation.channel,
      hasEmail: conversation.hasEmail,
      remainingMessages: Math.max(0, MAX_VISITOR_MESSAGES - conversation.visitorMessageCount),
      messages: rows.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.content,
        sources: (m.source_faq_ids ?? [])
          .filter((id) => questions.has(id))
          .map((id) => ({ id, question: questions.get(id)! })),
        mode: m.meta?.mode === "sample" || m.meta?.mode === "live" ? m.meta.mode : null,
        // An action result that n8n would have produced (no n8n configured).
        simulated: m.meta?.simulated === true,
        createdAt: m.created_at,
      })),
      // An unconfirmed action card, shown again after a refresh.
      pendingAction: card,
    },
    origin,
  );
}

function realtimeConfig() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = serverEnv();
  return url && key ? { url, key } : null;
}

const pollSince = z.iso.datetime({ offset: true });

/** GET /api/widget/poll?bot=&since=: new human/system messages (Realtime fallback). */
export async function handlePoll(request: Request, db: SupabaseClient): Promise<Response> {
  const url = new URL(request.url);
  const resolved = await resolveConversation(
    db,
    request,
    url.searchParams.get("bot"),
    WIDGET_RATE_LIMITS.poll,
  );
  if (!resolved.ok) return resolved.response;
  const { origin, conversation, bot } = resolved;

  // An open widget counts as a present visitor (decides whether a reply is also emailed).
  const touched = await db.rpc("touch_visitor_activity", {
    p_conversation_id: conversation.id,
    p_bot_id: bot.id,
  });
  if (touched.error) log.warn("widget.touch_failed", { code: touched.error.code });

  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? pollSince.safeParse(sinceParam) : null;
  if (since && !since.success) return widgetError("bad_request", 400, origin);

  let query = db
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversation.id)
    .eq("bot_id", bot.id)
    .in("role", ["human", "system"])
    .order("created_at", { ascending: true })
    .limit(50);
  if (since?.success) query = query.gt("created_at", since.data);
  const { data, error } = await query;
  if (error) {
    log.error("widget.poll_failed", { code: error.code });
    return widgetError("internal", 500, origin);
  }

  return widgetJson(
    {
      status: conversation.status,
      messages: (data as { id: string; role: string; content: string; created_at: string }[]).map(
        (m) => ({ id: m.id, role: m.role, text: m.content, createdAt: m.created_at }),
      ),
    },
    origin,
  );
}

/** Just the bot key, read first so later validation errors can carry CORS headers. */
const botKey = z.object({ bot: z.string() });
const rateSchema = z.object({ rating: z.enum(["up", "down"]) });

/** POST /api/widget/rate {bot, rating}: 👍/👎 for the conversation. */
export async function handleRate(request: Request, db: SupabaseClient): Promise<Response> {
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  const key = botKey.safeParse(body);
  if (!key.success) return widgetError("bad_request", 400);
  const resolved = await resolveConversation(
    db,
    request,
    key.data.bot,
    WIDGET_RATE_LIMITS.feedback,
  );
  if (!resolved.ok) return resolved.response;
  const { origin, conversation, bot } = resolved;
  const parsed = rateSchema.safeParse(body);
  if (!parsed.success) return widgetError("bad_request", 400, origin);

  const { error } = await db
    .from("conversations")
    .update({ rating: parsed.data.rating })
    .eq("id", conversation.id)
    .eq("bot_id", bot.id);
  if (error) {
    log.error("widget.rate_failed", { code: error.code });
    return widgetError("internal", 500, origin);
  }
  return widgetJson({ rating: parsed.data.rating }, origin);
}

const handoffSchema = z.object({
  email: z
    .string()
    .trim()
    .max(254)
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.email().optional()),
});

/**
 * POST /api/widget/handoff {bot, email?}: "Talk to a person", or the optional email given
 * after the handoff. Idempotent: a second call only stores the email.
 */
export async function handleHandoff(
  request: Request,
  db: SupabaseClient,
  onOutboxEvent?: () => void,
): Promise<Response> {
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  const key = botKey.safeParse(body);
  if (!key.success) return widgetError("bad_request", 400);
  const resolved = await resolveConversation(
    db,
    request,
    key.data.bot,
    WIDGET_RATE_LIMITS.feedback,
  );
  if (!resolved.ok) return resolved.response;
  const { origin, conversation, bot } = resolved;
  // Validated after the bot is known, so the widget can read the error (CORS headers).
  const parsed = handoffSchema.safeParse(body);
  if (!parsed.success) return widgetError("invalid_email", 400, origin);

  const result = await startHandoff(db, {
    botId: bot.id,
    conversationId: conversation.id,
    reason: await handoffReason(db, bot.id, conversation.id),
    email: parsed.data.email ?? null,
    language: conversation.language,
  });
  if (result.status === "handed_off") onOutboxEvent?.();
  if (result.status === "closed") return widgetError("conversation_closed", 409, origin);
  if (result.status === "not_found") return widgetError("invalid_token", 401, origin);

  return widgetJson(
    {
      status: result.status === "handed_off" ? "waiting_human" : conversation.status,
      message: result.message,
      messageId: result.messageId,
      hasEmail: conversation.hasEmail || Boolean(parsed.data.email),
    },
    origin,
  );
}

/** "Talk to a person" right after an action failed tells the owner why (spec §8). */
async function handoffReason(
  db: SupabaseClient,
  botId: string,
  conversationId: string,
): Promise<HandoffReason> {
  const { data } = await db
    .from("action_runs")
    .select("status, updated_at")
    .eq("conversation_id", conversationId)
    .eq("bot_id", botId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const recent = data && Date.now() - Date.parse(data.updated_at) < 15 * 60 * 1000;
  return recent && data.status === "failed" ? "action_failed" : "requested";
}

const confirmSchema = z.object({
  actionRunId: z.uuid(),
  decision: z.enum(["confirm", "cancel"]),
});

/**
 * POST /api/widget/confirm {bot, actionRunId, decision}: the visitor's answer to an action
 * card. The run must belong to this conversation and still wait for confirmation; it runs
 * at most once.
 */
export async function handleConfirm(request: Request, db: SupabaseClient): Promise<Response> {
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  const key = botKey.safeParse(body);
  if (!key.success) return widgetError("bad_request", 400);
  const resolved = await resolveConversation(
    db,
    request,
    key.data.bot,
    WIDGET_RATE_LIMITS.feedback,
  );
  if (!resolved.ok) return resolved.response;
  const { origin, conversation, bot } = resolved;
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return widgetError("bad_request", 400, origin);
  if (conversation.status === "resolved") return widgetError("conversation_closed", 409, origin);

  const result = await decideRun(db, n8nDispatcher(db), {
    runId: parsed.data.actionRunId,
    botId: bot.id,
    ownerId: bot.ownerId,
    conversationId: conversation.id,
    decision: parsed.data.decision,
    language: conversation.language,
  });
  if (result.status === "not_pending") return widgetError("action_not_pending", 409, origin);
  return widgetJson(result, origin);
}

const endSchema = z.object({ bot: z.string() });

/** POST /api/widget/end {bot}: the visitor closes the chat. Idempotent. */
export async function handleEnd(request: Request, db: SupabaseClient): Promise<Response> {
  const parsed = endSchema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
  if (!parsed.success) return widgetError("bad_request", 400);
  const resolved = await resolveConversation(
    db,
    request,
    parsed.data.bot,
    WIDGET_RATE_LIMITS.feedback,
  );
  if (!resolved.ok) return resolved.response;
  const { origin, conversation, bot } = resolved;

  if (conversation.status !== "resolved") {
    const { error } = await db
      .from("conversations")
      .update({ status: "resolved", resolved_by: "visitor" })
      .eq("id", conversation.id)
      .eq("bot_id", bot.id)
      .neq("status", "resolved");
    if (error) {
      log.error("widget.end_failed", { code: error.code });
      return widgetError("internal", 500, origin);
    }
  }
  return widgetJson({ status: "resolved" }, origin);
}

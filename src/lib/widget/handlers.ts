import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { logoPublicUrl } from "@/lib/bots/logo";
import { parseFeaturedQuestions, parseGreeting } from "@/lib/bots/schema";
import { readableForeground } from "@/lib/design/contrast";
import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";
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

  const { data: accepts, error } = await db.rpc("bot_accepts_conversations", {
    p_bot_id: bot.id,
  });
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
  meta: { mode?: string } | null;
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
      remainingMessages: Math.max(0, MAX_VISITOR_MESSAGES - conversation.visitorMessageCount),
      messages: rows.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.content,
        sources: (m.source_faq_ids ?? [])
          .filter((id) => questions.has(id))
          .map((id) => ({ id, question: questions.get(id)! })),
        mode: m.meta?.mode === "sample" || m.meta?.mode === "live" ? m.meta.mode : null,
        createdAt: m.created_at,
      })),
    },
    origin,
  );
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

const rateSchema = z.object({ bot: z.string(), rating: z.enum(["up", "down"]) });

/** POST /api/widget/rate {bot, rating}: 👍/👎 for the conversation. */
export async function handleRate(request: Request, db: SupabaseClient): Promise<Response> {
  const parsed = rateSchema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
  if (!parsed.success) return widgetError("bad_request", 400);
  const resolved = await resolveConversation(
    db,
    request,
    parsed.data.bot,
    WIDGET_RATE_LIMITS.feedback,
  );
  if (!resolved.ok) return resolved.response;
  const { origin, conversation, bot } = resolved;

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

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { LANGUAGES, type Language } from "@/lib/bots/schema";
import { hasLiveLlm } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { detectLanguage } from "@/lib/faqs/language";
import { embedQuery, searchFaqs, type QueryEmbedder } from "@/lib/faqs/search";
import { log } from "@/lib/log";
import { isWithinKeyedRateLimit } from "@/lib/security/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";

import {
  findConversation,
  loadBot,
  readJsonBody,
  visitorIpHash,
  widgetError,
  widgetOrigin,
  type WidgetConversation,
} from "./context";
import { corsHeaders } from "./cors";
import {
  MAX_BODY_BYTES,
  MAX_MESSAGE_CHARS,
  MAX_VISITOR_MESSAGES,
  WIDGET_RATE_LIMITS,
} from "./limits";
import { LIVE_MODE_IMPLEMENTED, selectMode } from "./mode";
import { SSE_HEADERS, sseStream } from "./sse";
import { hashToken, newConversationToken } from "./token";
import { runTurn, type ReplyRecord } from "./turn";

export type MessageDeps = {
  db: SupabaseClient;
  embed: QueryEmbedder;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

export function defaultMessageDeps(): MessageDeps | null {
  const db = supabaseAdmin();
  if (!db) return null;
  return {
    db,
    embed: embedQuery,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => performance.now(),
  };
}

const bodySchema = z.object({
  bot: z.string(),
  text: z.string(),
  locale: z.enum(LANGUAGES).optional().catch(undefined),
});

const retryAfter = (seconds: number) => ({ "Retry-After": String(seconds) });

/**
 * POST /api/widget/message: one visitor message in, one streamed bot turn out (spec §7).
 * Errors before the stream starts are JSON with a status code; failures after it are an
 * SSE `error` event.
 */
export async function handleMessage(request: Request, deps: MessageDeps): Promise<Response> {
  const startedAt = deps.now();
  const parsed = bodySchema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
  if (!parsed.success) return widgetError("bad_request", 400);
  const { db } = deps;

  const bot = await loadBot(db, parsed.data.bot);
  if (!bot) return widgetError("bot_not_found", 404);
  const origin = widgetOrigin(request, bot);
  if (origin.kind === "denied") return widgetError("origin_not_allowed", 403);

  const text = parsed.data.text.trim();
  if (!text) return widgetError("empty_message", 400, origin);
  if (text.length > MAX_MESSAGE_CHARS) return widgetError("message_too_long", 400, origin);
  if (!bot.active) return widgetError("bot_inactive", 503, origin);

  const ipHash = visitorIpHash(request);
  const { message, botDaily, newConversation } = WIDGET_RATE_LIMITS;
  const withinLimits = await Promise.all([
    ipHash ? isWithinKeyedRateLimit(message, `${bot.id}:${ipHash}`) : true,
    isWithinKeyedRateLimit(botDaily, bot.id),
  ]);
  if (!withinLimits[0]) return widgetError("rate_limited", 429, origin, retryAfter(60));
  if (!withinLimits[1]) return widgetError("bot_daily_limit", 429, origin, retryAfter(3600));

  // Existing conversation (token header) or a new one on the first message.
  const tokenHeader = request.headers.get("x-relay-token");
  let conversation: WidgetConversation | null;
  let token: string | undefined;
  let language: Language;

  if (tokenHeader) {
    conversation = await findConversation(db, bot.id, tokenHeader);
    if (!conversation) return widgetError("invalid_token", 401, origin);
    language = detectLanguage(text, parsed.data.locale ?? conversation.language);
  } else {
    if (ipHash && !(await isWithinKeyedRateLimit(newConversation, `${bot.id}:${ipHash}`))) {
      return widgetError("rate_limited", 429, origin, retryAfter(600));
    }
    language = detectLanguage(text, parsed.data.locale ?? bot.defaultLanguage);
    token = newConversationToken();
    const { data, error } = await db.rpc("start_conversation", {
      p_bot_id: bot.id,
      p_token_hash: hashToken(token),
      p_language: language,
      p_ip_hash: ipHash,
    });
    if (error) {
      log.error("widget.start_failed", { code: error.code });
      return widgetError("internal", 500, origin);
    }
    const started = data as { status: string; conversation_id?: string };
    if (started.status === "quota_exceeded") return widgetError("quota_exceeded", 503, origin);
    if (started.status === "bot_inactive") return widgetError("bot_inactive", 503, origin);
    if (started.status !== "ok" || !started.conversation_id) {
      return widgetError("bot_not_found", 404, origin);
    }
    conversation = {
      id: started.conversation_id,
      status: "bot",
      language,
      visitorMessageCount: 0,
      rating: null,
      createdAt: new Date().toISOString(),
    };
    log.info("widget.conversation_started", { botId: bot.id });
  }

  const added = await db.rpc("add_visitor_message", {
    p_conversation_id: conversation.id,
    p_bot_id: bot.id,
    p_content: text,
    p_language: language,
    p_max_messages: MAX_VISITOR_MESSAGES,
  });
  if (added.error) {
    log.error("widget.message_store_failed", { code: added.error.code });
    return widgetError("internal", 500, origin);
  }
  const stored = added.data as {
    status: string;
    conversation_status?: WidgetConversation["status"];
    visitor_message_count?: number;
  };
  if (stored.status === "cap_reached") return widgetError("message_cap_reached", 429, origin);
  if (stored.status === "closed") return widgetError("conversation_closed", 409, origin);
  if (stored.status !== "ok") return widgetError("invalid_token", 401, origin);

  const env = serverEnv();
  const mode = selectMode({
    hasApiKey: hasLiveLlm(env),
    // Live replies aren't counted until Live mode exists (Phase 10).
    liveMessagesToday: 0,
    dailyCap: env.DAILY_REAL_MESSAGE_CAP,
    liveImplemented: LIVE_MODE_IMPLEMENTED,
  });

  const events = runTurn(
    {
      botId: bot.id,
      conversationId: conversation.id,
      text,
      language,
      token,
      conversationStatus: stored.conversation_status ?? "bot",
      remainingMessages: MAX_VISITOR_MESSAGES - (stored.visitor_message_count ?? 0),
      mode,
      startedAt,
    },
    {
      search: (botId, question, lang) => searchFaqs(db, botId, question, lang, deps.embed),
      recordReply: (reply) => recordReply(db, reply),
      sleep: deps.sleep,
      now: deps.now,
    },
  );

  return new Response(sseStream(events), {
    headers: { ...SSE_HEADERS, ...corsHeaders(origin) },
  });
}

async function recordReply(db: SupabaseClient, reply: ReplyRecord): Promise<void> {
  const { error } = await db.rpc("record_bot_reply", {
    p_conversation_id: reply.conversationId,
    p_bot_id: reply.botId,
    p_content: reply.content,
    p_source_faq_ids: reply.sourceFaqIds,
    p_meta: reply.meta,
    p_outcome: reply.outcome,
    p_question: reply.question,
    p_language: reply.language,
    p_first_response_ms: reply.firstResponseMs,
  });
  if (error) {
    log.error("widget.reply_store_failed", { code: error.code });
    throw new Error("reply store failed");
  }
  log.info("widget.turn", {
    botId: reply.botId,
    outcome: reply.outcome,
    latencyMs: Number(reply.meta.latencyMs),
  });
}

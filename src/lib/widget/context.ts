import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Language } from "@/lib/bots/schema";
import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";
import { clientIp, hashIp } from "@/lib/security/ip";

import { checkOrigin, corsHeaders, originOf, type OriginCheck } from "./cors";
import { hashToken, isWellFormedToken, tokenMatchesHash } from "./token";

/**
 * Shared request plumbing for the public widget API. Every handler resolves the bot from its
 * public key, checks the Origin, and (for conversation endpoints) the visitor's token. All
 * queries run with the service role, so each one is scoped by bot id explicitly (spec §5.1).
 */

const PUBLIC_KEY = /^[A-Za-z0-9_-]{16,64}$/;

export type WidgetBot = {
  id: string;
  ownerId: string;
  name: string;
  active: boolean;
  allowedOrigins: string[];
  defaultLanguage: Language;
  brandColor: string;
  logoPath: string | null;
  greeting: unknown;
  position: "left" | "right";
  featuredQuestions: unknown;
};

export async function loadBot(db: SupabaseClient, publicKey: unknown): Promise<WidgetBot | null> {
  if (typeof publicKey !== "string" || !PUBLIC_KEY.test(publicKey)) return null;
  const { data, error } = await db
    .from("bots")
    .select(
      "id, owner_id, name, active, allowed_origins, default_language, brand_color, logo_path, greeting, position, featured_questions",
    )
    .eq("public_key", publicKey)
    .maybeSingle();
  if (error) {
    log.error("widget.bot_load_failed", { code: error.code });
    throw new Error("bot lookup failed");
  }
  if (!data) return null;
  return {
    id: data.id,
    ownerId: data.owner_id,
    name: data.name,
    active: data.active,
    allowedOrigins: data.allowed_origins ?? [],
    defaultLanguage: data.default_language === "sr" ? "sr" : "en",
    brandColor: data.brand_color,
    logoPath: data.logo_path,
    greeting: data.greeting,
    position: data.position === "left" ? "left" : "right",
    featuredQuestions: data.featured_questions,
  };
}

export function widgetOrigin(request: Request, bot: WidgetBot): OriginCheck {
  return checkOrigin(
    request.headers.get("origin"),
    bot.allowedOrigins,
    originOf(serverEnv().NEXT_PUBLIC_APP_URL),
  );
}

/** JSON error with the right CORS headers, so the widget can read why it failed. */
export function widgetError(
  code: string,
  status: number,
  origin: OriginCheck = { kind: "none" },
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: code },
    { status, headers: { ...corsHeaders(origin), "Cache-Control": "no-store", ...headers } },
  );
}

export function widgetJson(body: unknown, origin: OriginCheck, cache = "no-store"): Response {
  return Response.json(body, {
    headers: { ...corsHeaders(origin), "Cache-Control": cache },
  });
}

/** HMAC of the visitor's IP, or null without a salt or an address (rate limits then skip). */
export function visitorIpHash(request: Request): string | null {
  const salt = serverEnv().IP_HASH_SALT;
  const ip = clientIp(request.headers);
  return salt && ip ? hashIp(ip, salt) : null;
}

export type WidgetConversation = {
  id: string;
  status: "bot" | "waiting_human" | "human" | "resolved";
  language: Language;
  visitorMessageCount: number;
  createdAt: string;
};

/**
 * The conversation a token belongs to, within this bot only. Null for a malformed token,
 * an unknown one, or a token of another bot's conversation (all look the same to the caller).
 */
export async function findConversation(
  db: SupabaseClient,
  botId: string,
  token: string | null,
): Promise<WidgetConversation | null> {
  if (!isWellFormedToken(token)) return null;
  const tokenHash = hashToken(token);
  const { data, error } = await db
    .from("conversations")
    .select("id, token_hash, status, language, visitor_message_count, created_at")
    .eq("bot_id", botId)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    log.error("widget.conversation_load_failed", { code: error.code });
    throw new Error("conversation lookup failed");
  }
  if (!data || !tokenMatchesHash(token, data.token_hash)) return null;
  return {
    id: data.id,
    status: data.status,
    language: data.language === "sr" ? "sr" : "en",
    visitorMessageCount: data.visitor_message_count,
    createdAt: data.created_at,
  };
}

/** Reads a small JSON body; null for oversized, empty or invalid JSON. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  const text = await request.text();
  if (!text || new TextEncoder().encode(text).length > maxBytes) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

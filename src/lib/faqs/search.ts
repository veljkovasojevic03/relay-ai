import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Language } from "@/lib/bots/schema";
import { log } from "@/lib/log";

import { EmbedError, embedTexts, toPgVector } from "./embed";
import { embedConfig } from "./indexing";
import {
  decideAnswer,
  MATCH_COUNT,
  RETRIEVAL,
  toFaqMatch,
  type AnswerDecision,
  type FaqMatch,
  type MatchRow,
  type RetrievalSettings,
} from "./retrieval";
import { QUERY_MAX_LENGTH } from "./schema";
import { queryEmbeddingText } from "./text";

export type SearchResult = {
  matches: FaqMatch[];
  decision: AnswerDecision;
  settings: RetrievalSettings;
  /** False when the embed function was unreachable and only full-text search ran. */
  semantic: boolean;
};

/**
 * Retrieves and decides for one question. `client` is the owner's RLS client (playground) or
 * the service role (widget API, which resolved `botId` from the public key itself).
 * If embedding fails, full-text search still runs; with no similarity the bot never
 * answers, but the owner still sees what matched.
 */
/** Turns a question into a vector, or null when embedding isn't available. */
export type QueryEmbedder = (text: string) => Promise<number[] | null>;

/** The `embed` Edge Function, with a short timeout: a visitor is waiting. */
export const embedQuery: QueryEmbedder = async (text) => {
  const config = embedConfig();
  if (!config) return null;
  try {
    const [vector] = await embedTexts([queryEmbeddingText(text)], { ...config, timeoutMs: 10_000 });
    return vector ?? null;
  } catch (error) {
    log.warn("faqs.query_embed_failed", {
      reason: error instanceof EmbedError ? error.reason : "unknown",
    });
    return null;
  }
};

export async function searchFaqs(
  // Untyped client: both the SSR client (typed) and the admin client reach here.
  client: SupabaseClient,
  botId: string,
  question: string,
  language: Language,
  embed: QueryEmbedder = embedQuery,
): Promise<SearchResult> {
  const settings = RETRIEVAL[language];
  const text = question.slice(0, QUERY_MAX_LENGTH);
  const vector = await embed(text);
  const embedding = vector ? toPgVector(vector) : null;

  const { data, error } = await client.rpc("match_faqs", {
    p_bot_id: botId,
    p_query_embedding: embedding,
    p_query_text: text,
    p_k: MATCH_COUNT,
    p_hybrid: settings.hybrid,
    p_language: language,
  });
  if (error) {
    log.error("faqs.match_failed", { code: error.code });
    throw new Error("FAQ search failed");
  }

  const matches = (data as MatchRow[]).map(toFaqMatch);
  return {
    matches,
    decision: decideAnswer(matches, settings),
    settings,
    semantic: embedding !== null,
  };
}

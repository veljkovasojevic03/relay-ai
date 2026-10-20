import "server-only";

import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";
import { supabaseAdmin } from "@/lib/supabase/admin";

import { EmbedError, embedTexts, toPgVector, type EmbedConfig } from "./embed";
import { faqEmbeddingText } from "./text";

/** Embed function settings from the server env, or null when Supabase isn't configured. */
export function embedConfig(): EmbedConfig | null {
  const { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: secretKey } =
    serverEnv();
  return supabaseUrl && secretKey ? { supabaseUrl, secretKey } : null;
}

export type IndexResult = { indexed: number; failed: number };

/**
 * (Re)computes embeddings for FAQs of one bot. The caller MUST have checked that the
 * signed-in owner owns `botId`: this runs with the service role, because embedding columns
 * are server-only. Every query is still scoped by `bot_id`.
 *
 * `ids` limits the work to those FAQs; without it every FAQ of the bot is re-indexed.
 * A row edited while its vector was computed keeps `pending` (the `updated_at` guard), so a
 * stale vector never lands on new text.
 */
export async function indexFaqs(botId: string, ids?: string[]): Promise<IndexResult> {
  if (ids?.length === 0) return { indexed: 0, failed: 0 };
  const admin = supabaseAdmin();
  const config = embedConfig();
  if (!admin || !config) {
    log.warn("faqs.index_unconfigured");
    await markFailed(botId, ids);
    return { indexed: 0, failed: ids?.length ?? 0 };
  }

  let query = admin.from("faqs").select("id, question, updated_at").eq("bot_id", botId);
  if (ids) query = query.in("id", ids);
  const { data, error: loadError } = await query;
  if (loadError) {
    log.error("faqs.index_load_failed", { code: loadError.code });
    await markFailed(botId, ids);
    return { indexed: 0, failed: ids?.length ?? 0 };
  }
  const faqs = data as { id: string; question: string; updated_at: string }[];
  if (faqs.length === 0) return { indexed: 0, failed: 0 };

  let vectors: number[][];
  try {
    vectors = await embedTexts(faqs.map(faqEmbeddingText), config);
  } catch (error) {
    log.error("faqs.embed_failed", {
      reason: error instanceof EmbedError ? error.reason : "unknown",
      status: error instanceof EmbedError ? error.status : undefined,
      count: faqs.length,
    });
    await markFailed(
      botId,
      faqs.map((f) => f.id),
    );
    return { indexed: 0, failed: faqs.length };
  }

  const results = await Promise.all(
    faqs.map((faq, i) =>
      admin
        .from("faqs")
        .update({ embedding: toPgVector(vectors[i]!), embedding_status: "ready" })
        .eq("bot_id", botId)
        .eq("id", faq.id)
        .eq("updated_at", faq.updated_at)
        .select("id"),
    ),
  );
  const indexed = results.filter((r) => !r.error && r.data.length === 1).length;
  const errors = results.filter((r) => r.error).length;
  if (errors) log.error("faqs.index_save_failed", { count: errors });
  return { indexed, failed: errors };
}

async function markFailed(botId: string, ids?: string[]) {
  const admin = supabaseAdmin();
  if (!admin) return;
  let query = admin
    .from("faqs")
    .update({ embedding_status: "failed", embedding: null })
    .eq("bot_id", botId)
    .neq("embedding_status", "ready");
  if (ids) query = query.in("id", ids);
  const { error } = await query;
  if (error) log.error("faqs.mark_failed_failed", { code: error.code });
}

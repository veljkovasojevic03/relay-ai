import "server-only";

import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { normalizeForSearch } from "@/lib/faqs/text";
import { log } from "@/lib/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  groupUnknown,
  summarySchema,
  type FaqDraft,
  type Range,
  type Summary,
  type UnknownGroup,
} from "./summary";

/** Dashboard reads for analytics, through RLS as the signed-in owner. */

export async function getSummary(botId: string | null, days: Range): Promise<Summary> {
  await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  const { data, error } = await supabase.rpc("analytics_summary", {
    p_bot_id: botId ?? undefined,
    p_days: days,
  });
  if (error) {
    log.error("analytics.summary_failed", { code: error.code });
    throw new Error("Could not load analytics");
  }
  return summarySchema.parse(data);
}

const MAX_UNKNOWN_ROWS = 300;

/** Open unknown questions, grouped by question. Of one bot, or of all the owner's bots. */
export async function listUnknownQuestions(botId: string | null): Promise<UnknownGroup[]> {
  await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  let query = supabase
    .from("unknown_questions")
    .select("id, bot_id, question, language, suggested_answer, suggestion_source, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(MAX_UNKNOWN_ROWS);
  if (botId) query = query.eq("bot_id", botId);
  const { data, error } = await query;
  if (error) {
    log.error("analytics.unknown_failed", { code: error.code });
    throw new Error("Could not load unknown questions");
  }
  return groupUnknown(
    data.map((r) => ({
      id: r.id,
      botId: r.bot_id,
      question: r.question,
      language: r.language === "sr" ? "sr" : "en",
      suggestedAnswer: r.suggested_answer,
      suggestionSource:
        r.suggestion_source === "human_reply" || r.suggestion_source === "ai"
          ? r.suggestion_source
          : "none",
      createdAt: r.created_at,
    })),
  );
}

/**
 * A prefilled FAQ from an unknown question (spec §4.8): the question as asked, and the
 * human's reply as the draft answer when there is one (Sample mode: verbatim). Includes the
 * other open rows asking the same thing, so they're all resolved by one FAQ.
 */
export async function getFaqDraft(botId: string, unknownId: unknown): Promise<FaqDraft | null> {
  const id = z.uuid().safeParse(unknownId);
  if (!id.success) return null;
  await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  const { data: row } = await supabase
    .from("unknown_questions")
    .select("id, question, language, status")
    .eq("id", id.data)
    .eq("bot_id", botId)
    .maybeSingle();
  if (!row || row.status !== "open") return null;

  const groups = await listUnknownQuestions(botId);
  const key = normalizeForSearch(row.question).replace(/[?!.]+$/, "");
  const group = groups.find(
    (g) =>
      g.ids.includes(row.id) ||
      (g.language === row.language &&
        normalizeForSearch(g.question).replace(/[?!.]+$/, "") === key),
  );
  return {
    question: row.question,
    answer: group?.suggestedAnswer ?? "",
    language: row.language === "sr" ? "sr" : "en",
    unknownIds: group?.ids ?? [row.id],
  };
}

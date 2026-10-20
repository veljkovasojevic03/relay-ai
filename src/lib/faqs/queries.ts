import "server-only";

import { cache } from "react";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import type { Language } from "@/lib/bots/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EmbeddingStatus = "pending" | "ready" | "failed";

export type Faq = {
  id: string;
  question: string;
  answer: string;
  language: Language;
  featured: boolean;
  embeddingStatus: EmbeddingStatus;
  updatedAt: string;
};

type Row = {
  id: string;
  question: string;
  answer: string;
  language: string;
  featured: boolean;
  embedding_status: string;
  updated_at: string;
};

const toFaq = (row: Row): Faq => ({
  id: row.id,
  question: row.question,
  answer: row.answer,
  language: row.language === "sr" ? "sr" : "en",
  featured: row.featured,
  embeddingStatus:
    row.embedding_status === "ready" || row.embedding_status === "failed"
      ? row.embedding_status
      : "pending",
  updatedAt: row.updated_at,
});

/** FAQs of one of the signed-in owner's bots (RLS-scoped), featured first, then oldest. */
export const listFaqs = cache(async (botId: string): Promise<Faq[]> => {
  if (!z.uuid().safeParse(botId).success) return [];
  await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  const { data, error } = await supabase
    .from("faqs")
    .select("id, question, answer, language, featured, embedding_status, updated_at")
    .eq("bot_id", botId)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error("Could not load FAQs");
  return (data as Row[]).map(toFaq);
});

export function embeddingSummary(faqs: Faq[]) {
  const count = (status: EmbeddingStatus) =>
    faqs.filter((f) => f.embeddingStatus === status).length;
  return { ready: count("ready"), pending: count("pending"), failed: count("failed") };
}

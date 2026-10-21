import { z } from "zod";

import { normalizeForSearch } from "@/lib/faqs/text";

/**
 * Analytics shapes and the small pure helpers around them (spec §4.8). The numbers come
 * from SQL (`analytics_summary`); nothing here aggregates conversations in JS.
 */

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

export function parseRange(raw: unknown): Range {
  const n = Number(raw);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : 30;
}

const count = z.number().int().nonnegative();

export const summarySchema = z.object({
  days: z.number().int().positive(),
  totals: z.object({
    conversations: count,
    resolvedByBot: count,
    handedOff: count,
    avgFirstResponseMs: z.number().nullable(),
    ratingsUp: count,
    ratingsDown: count,
  }),
  daily: z.array(z.object({ day: z.string(), byBot: count, handedOff: count })),
});
export type Summary = z.output<typeof summarySchema>;

/** A share as a whole percentage, or null when there is nothing to divide. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export type UnknownRow = {
  id: string;
  botId: string;
  question: string;
  language: "en" | "sr";
  suggestedAnswer: string | null;
  suggestionSource: "human_reply" | "ai" | "none";
  createdAt: string;
};

export type UnknownGroup = {
  /** Every open row with this question; "Add to FAQ" and "Dismiss" act on all of them. */
  ids: string[];
  botId: string;
  question: string;
  language: "en" | "sr";
  count: number;
  lastAskedAt: string;
  suggestedAnswer: string | null;
  suggestionSource: "human_reply" | "ai" | "none";
};

/** The same question asked several times (case, spacing, diacritics aside) is one entry. */
export function groupUnknown(rows: UnknownRow[]): UnknownGroup[] {
  const groups = new Map<string, UnknownGroup>();
  // Newest first, so each group's question text and suggestion are the most recent ones.
  const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const row of sorted) {
    const key = `${row.botId}|${row.language}|${normalizeForSearch(row.question).replace(/[?!.]+$/, "")}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        ids: [row.id],
        botId: row.botId,
        question: row.question,
        language: row.language,
        count: 1,
        lastAskedAt: row.createdAt,
        suggestedAnswer: row.suggestedAnswer,
        suggestionSource: row.suggestedAnswer ? row.suggestionSource : "none",
      });
      continue;
    }
    group.ids.push(row.id);
    group.count++;
    if (!group.suggestedAnswer && row.suggestedAnswer) {
      group.suggestedAnswer = row.suggestedAnswer;
      group.suggestionSource = row.suggestionSource;
    }
  }
  // Asked most often first; ties by recency.
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || b.lastAskedAt.localeCompare(a.lastAskedAt),
  );
}

export type FaqDraft = {
  question: string;
  answer: string;
  language: "en" | "sr";
  /** The open unknown questions this FAQ answers; marked `added` once it's saved. */
  unknownIds: string[];
};

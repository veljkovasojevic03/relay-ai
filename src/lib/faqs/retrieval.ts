/**
 * Retrieval settings and the "would the bot answer?" decision. Pure, shared by the
 * playground, the widget API (Phase 4) and the eval script. The numbers come from
 * `pnpm eval:retrieval` (docs/RETRIEVAL_REPORT.md); re-run it whenever they change.
 */

export type RetrievalSettings = {
  /** Order by reciprocal-rank fusion of vector + full-text instead of similarity alone. */
  hybrid: boolean;
  /** Top match answers on similarity alone at or above this. */
  threshold: number;
  /**
   * Top match also answers at or above this lower similarity when its question contains
   * at least `minOverlap` of the visitor's content words (keyword corroboration).
   */
  corroboratedThreshold: number;
  minOverlap: number;
};

/**
 * Per language, because gte-small is English-only: Serbian similarities crowd together, so
 * Serbian leans on keyword corroboration and hybrid ranking (docs/RETRIEVAL_REPORT.md).
 */
export const RETRIEVAL: Record<"en" | "sr", RetrievalSettings> = {
  en: { hybrid: false, threshold: 0.88, corroboratedThreshold: 0.8, minOverlap: 0.5 },
  sr: { hybrid: true, threshold: 0.91, corroboratedThreshold: 0.895, minOverlap: 0.5 },
};

/** Matches fetched per query (the playground shows all of them). */
export const MATCH_COUNT = 5;
/** Questions offered as "did you mean" when the bot declines... */
export const SUGGESTION_COUNT = 3;
/** ...but only ones at least this close; unrelated questions shouldn't get random offers. */
export const SUGGESTION_MIN_SIMILARITY = 0.8;

export type FaqMatch = {
  id: string;
  question: string;
  answer: string;
  language: string;
  featured: boolean;
  /** Cosine similarity, null when the FAQ matched on text only. */
  similarity: number | null;
  vectorRank: number | null;
  textRank: number | null;
  rrfScore: number;
  /** Share (0..1) of the query's content words found in this FAQ's question. */
  keywordOverlap: number | null;
};

export type MatchRow = {
  id: string;
  question: string;
  answer: string;
  language: string;
  featured: boolean;
  similarity: number | null;
  vector_rank: number | null;
  text_rank: number | null;
  rrf_score: number | null;
  keyword_overlap: number | null;
};

export const toFaqMatch = (row: MatchRow): FaqMatch => ({
  id: row.id,
  question: row.question,
  answer: row.answer,
  language: row.language,
  featured: row.featured,
  similarity: row.similarity,
  vectorRank: row.vector_rank,
  textRank: row.text_rank,
  rrfScore: row.rrf_score ?? 0,
  keywordOverlap: row.keyword_overlap,
});

export type AnswerDecision =
  { kind: "answer"; faq: FaqMatch } | { kind: "unknown"; suggestions: FaqMatch[] };

/**
 * The bot answers from the top-ranked FAQ only when its similarity clears the threshold, or
 * the lower corroborated threshold when enough of its keywords match. Ranking may come from
 * fusion, but acceptance rests on similarity, because fused scores aren't calibrated.
 * When it declines, the top questions are still useful as "did you mean" suggestions.
 */
export function decideAnswer(matches: FaqMatch[], settings: RetrievalSettings): AnswerDecision {
  const top = matches[0] ?? null;
  if (top && top.similarity !== null) {
    const corroborated = (top.keywordOverlap ?? 0) >= settings.minOverlap;
    const bar = corroborated
      ? Math.min(settings.corroboratedThreshold, settings.threshold)
      : settings.threshold;
    if (top.similarity >= bar) return { kind: "answer", faq: top };
  }
  const suggestions = matches
    .filter((m) => m.similarity !== null && m.similarity >= SUGGESTION_MIN_SIMILARITY)
    .slice(0, SUGGESTION_COUNT);
  return { kind: "unknown", suggestions };
}

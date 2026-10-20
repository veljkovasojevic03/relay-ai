/**
 * Text normalization for retrieval (spec §12). Pure functions, shared by the app, the
 * Postgres side (mirrored by `private.search_normalize`) and the eval script.
 *
 * Serbian is often typed without diacritics ("sta je rok za povracaj"), so both FAQs and
 * queries are folded to plain ASCII letters before embedding and full-text matching. That
 * makes "šta" and "sta" the same token for both retrievers.
 */

/** Serbian letters whose ASCII spelling isn't just the base letter. */
const FOLD: Record<string, string> = { đ: "dj", Đ: "dj" };

/** Lowercase, diacritics folded (č→c, ž→z, đ→dj), whitespace collapsed. */
export function normalizeForSearch(text: string): string {
  return text
    .replace(/[đĐ]/g, (c) => FOLD[c] ?? c)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** What gets embedded for an FAQ. Questions match questions best, so the answer is left out. */
export function faqEmbeddingText(faq: { question: string }): string {
  return normalizeForSearch(faq.question);
}

/** What gets embedded for a visitor's question. */
export function queryEmbeddingText(query: string): string {
  return normalizeForSearch(query);
}

import { normalizeForSearch } from "./text";

import type { Language } from "@/lib/bots/schema";

export type { Language };

// Short, frequent Serbian words that are not English words. Matched on folded text, so
// "šta" and "sta" both count.
// prettier-ignore
const SERBIAN_WORDS = new Set([
  "sta", "da", "li", "je", "su", "se", "sam", "si", "za", "na", "od", "sa", "kod", "koliko",
  "kako", "kada", "kad", "gde", "zasto", "koji", "koja", "koje", "mogu", "moze", "imate", "imam",
  "nije", "nisam", "hocu", "treba", "molim", "hvala", "zdravo", "porudzbina", "porudzbinu",
  "dostava", "dostave", "povracaj", "vracanje", "zamena", "velicina", "broj", "cena", "placanje",
  "pouzecem", "radnja", "radno", "vreme", "ili", "ako", "jos", "vec",
]);

// prettier-ignore
const ENGLISH_WORDS = new Set([
  "the", "is", "are", "do", "does", "can", "how", "what", "when", "where", "why", "which", "my",
  "your", "you", "i", "a", "an", "to", "of", "for", "in", "on", "with", "it", "and", "or", "order",
  "shipping", "return", "returns", "size", "payment", "store", "hours", "please",
]);

/**
 * Best guess of a message's language, en or sr. Serbian diacritics decide immediately;
 * otherwise common function words are counted. Ties and empty input fall back.
 */
export function detectLanguage(text: string, fallback: Language): Language {
  if (/[čćžšđ]/i.test(text)) return "sr";
  const words = normalizeForSearch(text).match(/[a-z]+/g) ?? [];
  let sr = 0;
  let en = 0;
  for (const word of words) {
    if (SERBIAN_WORDS.has(word)) sr++;
    if (ENGLISH_WORDS.has(word)) en++;
  }
  if (sr === en) return fallback;
  return sr > en ? "sr" : "en";
}

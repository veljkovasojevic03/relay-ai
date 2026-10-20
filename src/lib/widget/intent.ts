import { normalizeForSearch } from "@/lib/faqs/text";

/**
 * "Talk to a human" requests typed into the chat (spec §4.4), in English and Serbian, with or
 * without diacritics. Deliberately narrow: a question that merely mentions people ("do your
 * staff speak English?") must still reach the FAQ.
 */
const PATTERNS = [
  // talk / speak / chat to a human, person, agent, someone...
  /\b(talk|speak|chat)\s+(to|with)\s+(a\s+|an\s+|the\s+|some\s+)?(real\s+|live\s+)?(human|person|people|someone|somebody|agent|operator|representative|staff|employee|support)\b/,
  /\b(real|live)\s+(human|person|agent)\b/,
  /\b(human|agent|operator|representative)\s*(please|pls)?\s*[!.?]*$/,
  /\bconnect\s+me\s+(to|with)\b/,
  /\bcustomer\s+(service|support)\s+(agent|person|representative)\b/,
  // razgovor/razgovarati/pričati sa osobom, čovekom, nekim...
  /\b(razgovor|razgovarati|razgovaram|pricati|pricam|popricati|pisati|pisem)\s+(sa|s)\s+(nekim|osobom|covekom|zivom\s+osobom|operaterom|agentom|podrskom|zaposlenim|radnikom|prodavcem)\b/,
  /\b(ziva|pravu|prava|zivu)\s+(osoba|osobu|coveka|covek)\b/,
  /\b(operater|operatera|covek|coveka|osobu)\s*(molim)?\s*[!.?]*$/,
  /\bpovezi\s+me\b/,
];

export function wantsHuman(text: string): boolean {
  const folded = normalizeForSearch(text);
  if (folded.length > 200) return false;
  return PATTERNS.some((pattern) => pattern.test(folded));
}

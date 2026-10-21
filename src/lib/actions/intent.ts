import { normalizeForSearch } from "@/lib/faqs/text";

import type { ActionName } from "./flow";

/**
 * Typed requests that start a guided action flow (spec §4.4), EN and SR, with or without
 * diacritics. Narrow on purpose: "how long does delivery of an order take?" is an FAQ
 * question, "where is my order?" is an order lookup.
 */
const ORDER = [
  /\btrack(ing)?\s+(my\s+|an\s+|the\s+|a\s+)?(order|package|parcel|shipment|delivery)\b/,
  /\border\s+(status|tracking)\b/,
  /\bstatus\s+of\s+(my\s+|an\s+|the\s+)?(order|package|parcel|shipment)\b/,
  /\bwhere('s|\s+is)\s+my\s+(order|package|parcel|shipment)\b/,
  /\b(prati|pratiti|pratim|pracenje)\s+(moje?\s+|moju\s+)?(porudzbin|narudzbin|posiljk|paket)\w*/,
  /\bstatus\s+(moje\s+)?(porudzbin|narudzbin|posiljk|paket)\w*/,
  /\bgde\s+je\s+(moja\s+|moj\s+)?(porudzbin|narudzbin|posiljk|paket)\w*/,
];

const TICKET = [
  /\b(create|open|file|submit|raise)\s+(a\s+|an\s+)?(support\s+)?(ticket|complaint)\b/,
  /\breport\s+(a\s+|an\s+)?(problem|issue)\b/,
  /\b(otvori|otvoriti|otvorim|napravi|napraviti|napravim|prijavi|prijaviti|prijavim|podnesi|podneti|podnesem)\s+(jedan\s+)?(tiket|reklamacij\w*|problem|zalb\w*)/,
  /\bprijava\s+problema\b/,
];

export function actionIntent(text: string): ActionName | null {
  const folded = normalizeForSearch(text);
  if (folded.length > 200) return null;
  if (ORDER.some((p) => p.test(folded))) return "order_status";
  if (TICKET.some((p) => p.test(folded))) return "create_ticket";
  return null;
}

import krojFaqs from "./kroj-faqs.json" with { type: "json" };

/**
 * The fictional demo shop "Kroj — moda i obuća" (spec §1, §4.10): the demo bot's settings,
 * its FAQ set, and what the "Try these" panel on /demo offers. Shared by `pnpm demo:seed`,
 * the sandbox seed and the demo page, so they can't drift apart.
 */

export type Lang = "en" | "sr";

export type KrojFaq = {
  key: string;
  language: Lang;
  featured: boolean;
  question: string;
  answer: string;
};

export const KROJ_FAQS = krojFaqs as KrojFaq[];

/**
 * Fixed public key of the demo store's bot. A bot's public key is public by design (it is in
 * every embed snippet); a fixed one lets /demo embed the bot without a lookup or an env var.
 */
export const DEMO_BOT_PUBLIC_KEY = "kroj-demo-store-bot";

/** Owner account of the demo bot when `pnpm demo:seed` creates one (it can't receive mail). */
export const DEMO_OWNER_EMAIL = "kroj-demo@relay-ai.invalid";

export const KROJ_BOT = {
  name: "Kroj — moda i obuća",
  description:
    "Support for the Kroj web shop: delivery, returns, sizes, payment, care and the Belgrade store.",
  brandColor: "#1f3d36",
  greeting: {
    en: "Hi! I'm Kroj's assistant. Ask me about delivery, returns, sizes or your order.",
    sr: "Zdravo! Ja sam Krojev asistent. Pitaj me za dostavu, povraćaj, veličine ili porudžbinu.",
  },
  featuredQuestions: [
    { language: "en", text: "How long does delivery take?" },
    { language: "en", text: "How long do I have to return an item?" },
    { language: "en", text: "Track my order" },
    { language: "sr", text: "Koliko traje dostava?" },
    { language: "sr", text: "Koji je rok za povraćaj robe?" },
    { language: "sr", text: "Prati moju porudžbinu" },
  ] satisfies { language: Lang; text: string }[],
} as const;

/**
 * Orders the "Try these" panel lists. Each one exists in `demo_orders` (seeded by the Phase 7
 * migration) with exactly this email; a DB test checks it.
 */
export const TRY_ORDERS = [
  { orderNumber: "KR-10482", email: "marko@example.com", status: "shipped" },
  { orderNumber: "KR-10519", email: "jelena@example.com", status: "processing" },
  { orderNumber: "KR-10377", email: "ana.petrovic@example.com", status: "delivered" },
  { orderNumber: "KR-10233", email: "nikola@example.com", status: "cancelled" },
] as const;

/** Sample questions: answered from the FAQ, an action, a handoff, and one it can't answer. */
export const TRY_QUESTIONS: Record<Lang, { text: string; kind: TryKind }[]> = {
  en: [
    { text: "How much does shipping cost?", kind: "faq" },
    { text: "Can I exchange shoes for a bigger size?", kind: "faq" },
    { text: "How do I wash a wool sweater?", kind: "faq" },
    { text: "Track my order", kind: "action" },
    { text: "I'd like to open a support ticket", kind: "action" },
    { text: "Do you sell children's clothes?", kind: "unknown" },
    { text: "Can I talk to a person?", kind: "human" },
  ],
  sr: [
    { text: "Koliko košta dostava?", kind: "faq" },
    { text: "Mogu li da zamenim patike za drugi broj?", kind: "faq" },
    { text: "Kako se pere vuneni džemper?", kind: "faq" },
    { text: "Prati moju porudžbinu", kind: "action" },
    { text: "Želim da otvorim tiket za podršku", kind: "action" },
    { text: "Da li prodajete dečiju odeću?", kind: "unknown" },
    { text: "Mogu li da razgovaram sa osobom?", kind: "human" },
  ],
};

export type TryKind = "faq" | "action" | "unknown" | "human";

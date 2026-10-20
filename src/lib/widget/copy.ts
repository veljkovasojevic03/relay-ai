import type { Language } from "@/lib/bots/schema";

/** What the bot and the system say in the chat, in the visitor's language. Plain text only. */
export const BOT_COPY: Record<
  Language,
  { unknown: string; degraded: string; handoff: (shop: string) => string }
> = {
  en: {
    unknown:
      "I'm not sure about that one, and I'd rather not guess. Would you like to talk to a person?",
    degraded:
      "I can't look that up right now. Please try again in a moment, or ask to talk to a person.",
    handoff: (shop) =>
      `A person from ${shop} will reply here as soon as they can. If you like, leave your email and the answer will reach you there too.`,
  },
  sr: {
    unknown: "Nisam siguran za to i ne bih da nagađam. Želiš li da razgovaraš sa osobom?",
    degraded:
      "Trenutno ne mogu to da proverim. Pokušaj ponovo za trenutak ili zatraži razgovor sa osobom.",
    handoff: (shop) =>
      `Osoba iz tima ${shop} će ti odgovoriti ovde čim bude mogla. Ako želiš, ostavi email i odgovor će ti stići i tamo.`,
  },
};

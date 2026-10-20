import type { Language } from "@/lib/bots/schema";

/** What the bot itself says in Sample mode, in the visitor's language. Plain text only. */
export const BOT_COPY: Record<Language, { unknown: string; degraded: string }> = {
  en: {
    unknown:
      "I'm not sure about that one, and I'd rather not guess. Would you like to talk to a person?",
    degraded:
      "I can't look that up right now. Please try again in a moment, or ask to talk to a person.",
  },
  sr: {
    unknown: "Nisam siguran za to i ne bih da nagađam. Želiš li da razgovaraš sa osobom?",
    degraded:
      "Trenutno ne mogu to da proverim. Pokušaj ponovo za trenutak ili zatraži razgovor sa osobom.",
  },
};

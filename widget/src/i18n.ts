export type Lang = "en" | "sr";

/** Every string the widget shows, in both languages. Plain text only. */
export const STRINGS = {
  en: {
    open: "Open chat",
    close: "Minimize chat",
    title: "Chat with {name}",
    subtitle: "Usually replies right away",
    greeting: "Hi! How can I help you today?",
    placeholder: "Type your question…",
    send: "Send",
    sample: "Sample",
    sampleTitle: "Answered with a saved reply, without AI",
    answeredFrom: "Answered from: {question}",
    typing: "{name} is typing",
    suggestions: "Related questions",
    endChat: "End chat",
    ended: "This chat has ended.",
    rate: "How was this chat?",
    rateUp: "Helpful",
    rateDown: "Not helpful",
    thanks: "Thanks for the feedback!",
    newChat: "Start a new chat",
    remaining: "{count} messages left in this chat",
    preview: "Preview only, sending is off",
    errors: {
      unavailable: "Chat isn't available right now. Please try again later.",
      rate_limited: "That's a lot of messages at once. Please wait a moment.",
      message_cap_reached: "This chat has reached its message limit. Start a new chat to continue.",
      message_too_long: "Please keep your message under 500 characters.",
      conversation_closed: "This chat has ended. Start a new chat to continue.",
      network: "Couldn't reach the chat. Check your connection and try again.",
      generic: "Something went wrong. Please try again.",
    },
  },
  sr: {
    open: "Otvori čet",
    close: "Umanji čet",
    title: "Čet sa: {name}",
    subtitle: "Obično odgovara odmah",
    greeting: "Zdravo! Kako mogu da pomognem?",
    placeholder: "Napiši pitanje…",
    send: "Pošalji",
    sample: "Probni",
    sampleTitle: "Odgovoreno sačuvanim odgovorom, bez veštačke inteligencije",
    answeredFrom: "Odgovor iz: {question}",
    typing: "{name} kuca",
    suggestions: "Povezana pitanja",
    endChat: "Završi čet",
    ended: "Ovaj čet je završen.",
    rate: "Kakav je bio ovaj čet?",
    rateUp: "Korisno",
    rateDown: "Nije korisno",
    thanks: "Hvala na oceni!",
    newChat: "Započni novi čet",
    remaining: "Preostalo poruka u ovom četu: {count}",
    preview: "Samo pregled, slanje je isključeno",
    errors: {
      unavailable: "Čet trenutno nije dostupan. Pokušaj ponovo kasnije.",
      rate_limited: "Previše poruka odjednom. Sačekaj trenutak.",
      message_cap_reached: "Ovaj čet je dostigao ograničenje poruka. Započni novi čet.",
      message_too_long: "Poruka može imati najviše 500 znakova.",
      conversation_closed: "Ovaj čet je završen. Započni novi čet da nastaviš.",
      network: "Čet nije dostupan. Proveri vezu i pokušaj ponovo.",
      generic: "Nešto nije u redu. Pokušaj ponovo.",
    },
  },
} as const;

export type Strings = (typeof STRINGS)[Lang];
export type ErrorKey = keyof Strings["errors"];

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Page language → widget language: an explicit data-lang wins, then <html lang>, then the browser. */
export function pickLanguage(explicit: string | null, fallback: Lang): Lang {
  const candidates = [
    explicit,
    document.documentElement.lang,
    ...(navigator.languages ?? [navigator.language]),
  ];
  for (const c of candidates) {
    const tag = c?.toLowerCase() ?? "";
    if (/^(sr|hr|bs|sh|me|cnr)\b/.test(tag)) return "sr";
    if (tag.startsWith("en")) return "en";
  }
  return fallback;
}

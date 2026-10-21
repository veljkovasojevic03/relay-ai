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
    talkToHuman: "Talk to a person",
    waiting: "A person will reply here soon",
    withHuman: "You're chatting with the {name} team",
    team: "{name} team",
    emailLabel: "Your email (optional)",
    emailHint: "Only used to send you the answer.",
    emailSend: "Save email",
    emailSkip: "No thanks",
    emailSaved: "Thanks! The answer will reach your inbox too.",
    newReply: "New reply from the {name} team",
    // Must match the server's action triggers (src/lib/actions/copy.ts).
    actions: { order_status: "Track my order", create_ticket: "Report a problem" },
    quickReplies: "Quick replies",
    card: {
      order_status: "Look up this order?",
      create_ticket: "Send this ticket to the team?",
      orderNumber: "Order number",
      email: "Email",
      subject: "Subject",
      description: "Details",
      confirm: "Confirm",
      cancel: "Cancel",
      working: "Working on it…",
      confirmed: "Confirmed",
      cancelled: "Cancelled",
      expired: "This request is no longer open.",
    },
    simulated: "simulated",
    simulatedTitle: "Demo: n8n isn't connected, so this result was simulated",
    errors: {
      unavailable: "Chat isn't available right now. Please try again later.",
      invalid_email: "That email doesn't look right. Please check it.",
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
    talkToHuman: "Razgovaraj sa osobom",
    waiting: "Osoba će ti uskoro odgovoriti ovde",
    withHuman: "Dopisuješ se sa timom: {name}",
    team: "Tim: {name}",
    emailLabel: "Tvoj email (nije obavezno)",
    emailHint: "Koristi se samo da ti pošaljemo odgovor.",
    emailSend: "Sačuvaj email",
    emailSkip: "Ne, hvala",
    emailSaved: "Hvala! Odgovor će ti stići i na email.",
    newReply: "Novi odgovor od tima: {name}",
    actions: { order_status: "Prati porudžbinu", create_ticket: "Prijavi problem" },
    quickReplies: "Brzi odgovori",
    card: {
      order_status: "Da proverim ovu porudžbinu?",
      create_ticket: "Da pošaljem ovaj tiket timu?",
      orderNumber: "Broj porudžbine",
      email: "Email",
      subject: "Naslov",
      description: "Opis",
      confirm: "Potvrdi",
      cancel: "Otkaži",
      working: "Radim na tome…",
      confirmed: "Potvrđeno",
      cancelled: "Otkazano",
      expired: "Ovaj zahtev više nije aktivan.",
    },
    simulated: "simulirano",
    simulatedTitle: "Demo: n8n nije povezan, pa je ovaj rezultat simuliran",
    errors: {
      unavailable: "Čet trenutno nije dostupan. Pokušaj ponovo kasnije.",
      invalid_email: "Email ne izgleda ispravno. Proveri ga.",
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

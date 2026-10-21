import type { Language } from "@/lib/bots/schema";

/** What the bot says during guided action flows and after an action ran. Plain text. */

type Prompt = { ask: string; retry: string };

type ActionCopy = {
  /** Quick-reply chips that start each flow (they match `actionIntent`). */
  triggers: { order_status: string; create_ticket: string };
  intro: { order_status: string; create_ticket: string };
  prompts: {
    order_status: { orderNumber: Prompt; email: Prompt };
    create_ticket: { subject: Prompt; description: Prompt; email: Prompt };
  };
  cancel: string;
  skip: string;
  confirmPrompt: string;
  cancelled: string;
  declined: string;
  gaveUp: string;
  failed: string;
  orderNotFound: string;
  order: (o: {
    orderNumber: string;
    status: string;
    eta: string | null;
    items: string[];
  }) => string;
  ticketCreated: (reference: string, withEmail: boolean) => string;
};

const formatDate = (iso: string | null, locale: string) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date);
};

const EN_STATUS: Record<string, string> = {
  processing: "is being prepared",
  shipped: "is on its way",
  delivered: "has been delivered",
  cancelled: "was cancelled",
};
const SR_STATUS: Record<string, string> = {
  processing: "se priprema",
  shipped: "je poslata i stiže uskoro",
  delivered: "je isporučena",
  cancelled: "je otkazana",
};

export const ACTION_COPY: Record<Language, ActionCopy> = {
  en: {
    triggers: { order_status: "Track my order", create_ticket: "Report a problem" },
    intro: {
      order_status: "Sure, let's look up your order.",
      create_ticket: "Okay, I'll pass this to the team as a ticket.",
    },
    prompts: {
      order_status: {
        orderNumber: {
          ask: "What's your order number? It's in your confirmation email (for example KR-10482).",
          retry:
            "That doesn't look like an order number. Please type it as in your confirmation email, for example KR-10482.",
        },
        email: {
          ask: "And the email address you used for the order?",
          retry: "That doesn't look like an email address. Please check it and try again.",
        },
      },
      create_ticket: {
        subject: {
          ask: "In a few words, what's the problem?",
          retry: "Please describe it in a few words (3 to 200 characters).",
        },
        description: {
          ask: "Thanks. Tell me a bit more: what happened?",
          retry: "Please add a short description, so the team knows what to look at.",
        },
        email: {
          ask: "Where can the team reach you? Type your email, or skip.",
          retry: "That doesn't look like an email address. Type it again, or skip.",
        },
      },
    },
    cancel: "Cancel",
    skip: "Skip",
    confirmPrompt: "Please check the details and confirm.",
    cancelled: "No problem, I've stopped. Anything else I can help with?",
    declined: "Okay, I didn't do anything. Anything else I can help with?",
    gaveUp: "Let's stop here for now. A person from the team can help you with this.",
    failed: "Sorry, I couldn't complete that right now. Would you like to talk to a person?",
    orderNotFound:
      "I couldn't find an order with that number and email. Please check both and try again, or ask to talk to a person.",
    order: ({ orderNumber, status, eta, items }) => {
      const parts = [`Order ${orderNumber} ${EN_STATUS[status] ?? `is ${status}`}.`];
      const date =
        status === "shipped" || status === "processing" ? formatDate(eta, "en-GB") : null;
      if (date) parts.push(`Expected delivery: ${date}.`);
      if (items.length) parts.push(`Items: ${items.join(", ")}.`);
      return parts.join(" ");
    },
    ticketCreated: (reference, withEmail) =>
      `Done. Your ticket number is ${reference}. The team will get back to you${withEmail ? " by email" : " here"} as soon as they can.`,
  },
  sr: {
    triggers: { order_status: "Prati porudžbinu", create_ticket: "Prijavi problem" },
    intro: {
      order_status: "Važi, hajde da proverimo porudžbinu.",
      create_ticket: "U redu, proslediću ovo timu kao tiket.",
    },
    prompts: {
      order_status: {
        orderNumber: {
          ask: "Koji je broj porudžbine? Nalazi se u mejlu sa potvrdom (na primer KR-10482).",
          retry:
            "To ne liči na broj porudžbine. Upiši ga kao u mejlu sa potvrdom, na primer KR-10482.",
        },
        email: {
          ask: "A email adresa koju si koristio/la za porudžbinu?",
          retry: "To ne liči na email adresu. Proveri je i pokušaj ponovo.",
        },
      },
      create_ticket: {
        subject: {
          ask: "U nekoliko reči, u čemu je problem?",
          retry: "Opiši ga u nekoliko reči (od 3 do 200 znakova).",
        },
        description: {
          ask: "Hvala. Napiši još malo: šta se desilo?",
          retry: "Dodaj kratak opis, da tim zna šta da proveri.",
        },
        email: {
          ask: "Gde tim može da ti se javi? Upiši email ili preskoči.",
          retry: "To ne liči na email adresu. Upiši je ponovo ili preskoči.",
        },
      },
    },
    cancel: "Otkaži",
    skip: "Preskoči",
    confirmPrompt: "Proveri podatke i potvrdi.",
    cancelled: "Nema problema, prekinuo sam. Mogu li još nešto da pomognem?",
    declined: "U redu, ništa nisam uradio. Mogu li još nešto da pomognem?",
    gaveUp: "Hajde da stanemo ovde. Osoba iz tima može da ti pomogne oko ovoga.",
    failed: "Izvini, trenutno ne mogu to da završim. Želiš li da razgovaraš sa osobom?",
    orderNotFound:
      "Nisam našao porudžbinu sa tim brojem i email adresom. Proveri oba podatka i pokušaj ponovo ili zatraži razgovor sa osobom.",
    order: ({ orderNumber, status, eta, items }) => {
      const parts = [`Porudžbina ${orderNumber} ${SR_STATUS[status] ?? `ima status ${status}`}.`];
      const date =
        status === "shipped" || status === "processing" ? formatDate(eta, "sr-Latn") : null;
      if (date) parts.push(`Očekivana isporuka: ${date}.`);
      if (items.length) parts.push(`Artikli: ${items.join(", ")}.`);
      return parts.join(" ");
    },
    ticketCreated: (reference, withEmail) =>
      `Gotovo. Broj tvog tiketa je ${reference}. Tim će ti se javiti${withEmail ? " mejlom" : " ovde"} čim bude mogao.`,
  },
};

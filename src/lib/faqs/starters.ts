import type { Language } from "@/lib/bots/schema";

/**
 * The empty state's one-click starter set (spec §9): the three questions every shop gets.
 * Generic but true-to-form answers the owner is expected to edit.
 */
export const STARTER_FAQS: Record<Language, { question: string; answer: string }[]> = {
  en: [
    {
      question: "How long does delivery take?",
      answer:
        "Orders usually ship within 1–2 working days, and delivery takes another 1–3 working days. You'll get a tracking link by email as soon as your parcel leaves us.",
    },
    {
      question: "Can I return an item?",
      answer:
        "Yes. You can return unused items in their original packaging within 14 days of delivery. Ask for a person in this chat and we'll send you the return details.",
    },
    {
      question: "How can I contact you?",
      answer:
        "Ask for a person right here in the chat and we'll reply as soon as we can, usually within one working day.",
    },
  ],
  sr: [
    {
      question: "Koliko traje dostava?",
      answer:
        "Porudžbine obično šaljemo u roku od 1–2 radna dana, a dostava traje još 1–3 radna dana. Link za praćenje stiže ti mejlom čim paket krene.",
    },
    {
      question: "Mogu li da vratim artikal?",
      answer:
        "Da. Nekorišćene artikle u originalnom pakovanju možeš vratiti u roku od 14 dana od dostave. Zatraži osobu u ovom četu i poslaćemo ti detalje za povraćaj.",
    },
    {
      question: "Kako da vas kontaktiram?",
      answer:
        "Zatraži osobu ovde u četu i odgovorićemo čim budemo mogli, obično u roku od jednog radnog dana.",
    },
  ],
};

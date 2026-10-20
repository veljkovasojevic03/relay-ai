import { z } from "zod";

import { LANGUAGES } from "@/lib/bots/schema";

export const QUESTION_MAX = 500;
export const ANSWER_MAX = 4000;
/** Soft cap per bot; keeps embedding work and the Free-tier database small. */
export const FAQS_PER_BOT_MAX = 300;
export const IMPORT_MAX = 100;
/** Longest visitor / playground question that gets searched. */
export const QUERY_MAX_LENGTH = 500;

const question = z
  .string({ error: "required" })
  .trim()
  .min(1, { error: "required" })
  .max(QUESTION_MAX, { error: "tooLong" });

const answer = z
  .string({ error: "required" })
  .trim()
  .min(1, { error: "required" })
  .max(ANSWER_MAX, { error: "tooLong" });

const language = z.enum(LANGUAGES, { error: "required" });

/** One FAQ from the dashboard form. Checkbox semantics: present = on. */
export const faqFormSchema = z.object({
  question,
  answer,
  language,
  featured: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

export type FaqInput = z.output<typeof faqFormSchema>;

/** A parsed import item, validated again on the server. */
export const faqImportItemSchema = z.object({ question, answer });

export const faqImportSchema = z.object({
  language,
  items: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "generic" });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(faqImportItemSchema)
        .min(1, { error: "importEmpty" })
        .max(IMPORT_MAX, { error: "importTooMany" }),
    ),
});

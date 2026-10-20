import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

import { normalizeOrigins } from "./origins";

export const LANGUAGES = ["en", "sr"] as const;
export type Language = (typeof LANGUAGES)[number];
export const MAX_QUESTIONS_PER_LANGUAGE = 3;

export const DEFAULT_BRAND_COLOR = "#b3472b";

export type FeaturedQuestion = { language: Language; text: string };
export type Greeting = Partial<Record<Language, string>>;

const text = (max: number) => z.string().trim().max(max, { error: "tooLong" });

/** A JSON-encoded hidden field (list editors post their state this way). */
function jsonField<T extends z.ZodType>(schema: T) {
  return z
    .string()
    .optional()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw || "[]") as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "generic" });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

const featuredQuestion = z.object({
  language: z.enum(LANGUAGES),
  text: z.string().trim().min(1, { error: "required" }).max(120, { error: "tooLong" }),
});

/** The bot settings form (spec §4.2). Error messages are `Errors.*` keys. */
export const botFormSchema = z.object({
  name: z.string().trim().min(1, { error: "required" }).max(80, { error: "tooLong" }),
  description: text(2000),
  defaultLanguage: z.enum(LANGUAGES, { error: "required" }),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, { error: "invalidColor" })
    .transform((v) => v.toLowerCase()),
  greetingEn: text(300),
  greetingSr: text(300),
  position: z.enum(["left", "right"], { error: "required" }),
  // Checkbox semantics: present ("on") means true.
  active: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  allowedOrigins: jsonField(z.array(z.string()).max(50)).transform((list, ctx) => {
    const result = normalizeOrigins(list);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.origins;
  }),
  featuredQuestions: jsonField(z.array(featuredQuestion).max(10)).refine(
    (list) =>
      LANGUAGES.every(
        (lang) => list.filter((q) => q.language === lang).length <= MAX_QUESTIONS_PER_LANGUAGE,
      ),
    { error: "tooManyQuestions" },
  ),
});

export type BotForm = z.output<typeof botFormSchema>;

type BotWrite = Database["public"]["Tables"]["bots"]["Update"];

/** Maps the validated form to the columns an owner may write. */
export function toBotColumns(form: BotForm) {
  const greeting: Greeting = {};
  if (form.greetingEn) greeting.en = form.greetingEn;
  if (form.greetingSr) greeting.sr = form.greetingSr;
  return {
    name: form.name,
    description: form.description,
    default_language: form.defaultLanguage,
    brand_color: form.brandColor,
    greeting,
    position: form.position,
    active: form.active,
    allowed_origins: form.allowedOrigins,
    featured_questions: form.featuredQuestions,
  } satisfies BotWrite;
}

/** Reads the loosely typed jsonb columns back into safe shapes. */
export function parseGreeting(value: unknown): Greeting {
  const out: Greeting = {};
  if (value && typeof value === "object") {
    for (const lang of LANGUAGES) {
      const v = (value as Record<string, unknown>)[lang];
      if (typeof v === "string" && v.trim()) out[lang] = v;
    }
  }
  return out;
}

export function parseFeaturedQuestions(value: unknown): FeaturedQuestion[] {
  const result = z.array(featuredQuestion).safeParse(value);
  return result.success ? result.data : [];
}

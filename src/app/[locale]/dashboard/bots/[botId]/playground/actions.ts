"use server";

import { z } from "zod";

import { localeOf, ownerClient } from "@/lib/auth/owner";
import { requireUser } from "@/lib/auth/session";
import { LANGUAGES, type Language } from "@/lib/bots/schema";
import { detectLanguage } from "@/lib/faqs/language";
import type { FaqMatch, RetrievalSettings } from "@/lib/faqs/retrieval";
import { QUERY_MAX_LENGTH } from "@/lib/faqs/schema";
import { searchFaqs } from "@/lib/faqs/search";
import { log } from "@/lib/log";
import { isWithinOwnerRateLimit, PLAYGROUND_RATE_LIMIT } from "@/lib/security/rate-limit";
import type { ErrorKey } from "@/lib/validation/errors";
import { formValues } from "@/lib/validation/errors";

export type PlaygroundResult = {
  question: string;
  language: Language;
  detected: boolean;
  matches: FaqMatch[];
  settings: RetrievalSettings;
  semantic: boolean;
  /** Id of the FAQ the bot would answer from, or null for "I don't know". */
  answerFaqId: string | null;
  /** Shown as "did you mean" when the bot declines. */
  suggestionIds: string[];
};

export type PlaygroundState =
  | { status: "idle" }
  | { status: "error"; error: ErrorKey; question?: string }
  | { status: "success"; result: PlaygroundResult };

const inputSchema = z.object({
  botId: z.uuid(),
  question: z
    .string()
    .trim()
    .min(1, { error: "required" })
    .max(QUERY_MAX_LENGTH, { error: "tooLong" }),
  language: z.enum(["auto", ...LANGUAGES]),
});

export async function testBotAction(
  _prev: PlaygroundState,
  formData: FormData,
): Promise<PlaygroundState> {
  const values = formValues(formData);
  const locale = localeOf(values);
  const supabase = await ownerClient(locale);
  const user = await requireUser(locale);

  const parsed = inputSchema.safeParse(values);
  if (!parsed.success) {
    const issue = parsed.error.issues.find((i) => i.path[0] === "question");
    return {
      status: "error",
      error: issue?.message === "tooLong" ? "tooLong" : issue ? "required" : "notFound",
      question: values.question,
    };
  }
  const { botId, question } = parsed.data;

  const { data: bot } = await supabase
    .from("bots")
    .select("id, default_language")
    .eq("id", botId)
    .maybeSingle();
  if (!bot) return { status: "error", error: "notFound", question };

  if (!(await isWithinOwnerRateLimit(PLAYGROUND_RATE_LIMIT, user.id))) {
    return { status: "error", error: "rateLimited", question };
  }

  const fallback: Language = bot.default_language === "sr" ? "sr" : "en";
  const choice = parsed.data.language;
  const detected = choice === "auto";
  const language: Language = choice === "auto" ? detectLanguage(question, fallback) : choice;

  try {
    // The owner's own client: RLS confines the search to their bots.
    const search = await searchFaqs(supabase, botId, question, language);
    return {
      status: "success",
      result: {
        question,
        language,
        detected,
        matches: search.matches,
        settings: search.settings,
        semantic: search.semantic,
        answerFaqId: search.decision.kind === "answer" ? search.decision.faq.id : null,
        suggestionIds:
          search.decision.kind === "unknown" ? search.decision.suggestions.map((m) => m.id) : [],
      },
    };
  } catch {
    log.error("playground.search_failed", {});
    return { status: "error", error: "generic", question };
  }
}

import { describe, expect, it } from "vitest";

import { actionIntent } from "@/lib/actions/intent";
import { MAX_QUESTIONS_PER_LANGUAGE } from "@/lib/bots/schema";
import { wantsHuman } from "@/lib/widget/intent";

import { DEMO_BOT_PUBLIC_KEY, KROJ_BOT, KROJ_FAQS, TRY_QUESTIONS } from "./kroj";

describe("Kroj demo data", () => {
  it("has the same 25 FAQ keys in English and Serbian", () => {
    const keys = (lang: string) =>
      KROJ_FAQS.filter((f) => f.language === lang)
        .map((f) => f.key)
        .sort();
    expect(keys("en")).toHaveLength(25);
    expect(keys("sr")).toEqual(keys("en"));
  });

  it("uses a public key the database accepts", () => {
    expect(DEMO_BOT_PUBLIC_KEY).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });

  it("stays within the bot's quick-question limit per language", () => {
    for (const lang of ["en", "sr"]) {
      expect(
        KROJ_BOT.featuredQuestions.filter((q) => q.language === lang).length,
      ).toBeLessThanOrEqual(MAX_QUESTIONS_PER_LANGUAGE);
    }
  });

  // The panel's labels promise what each question does; the routing code must agree.
  it.each(["en", "sr"] as const)("labels every %s sample question by how it is handled", (lang) => {
    for (const q of TRY_QUESTIONS[lang]) {
      const route = actionIntent(q.text) ? "action" : wantsHuman(q.text) ? "human" : "search";
      expect({ text: q.text, route }).toEqual({
        text: q.text,
        route: q.kind === "action" || q.kind === "human" ? q.kind : "search",
      });
    }
  });

  it("doesn't repeat an action as a quick question (the widget adds action chips itself)", () => {
    expect(KROJ_BOT.featuredQuestions.filter((q) => actionIntent(q.text))).toEqual([]);
  });
});

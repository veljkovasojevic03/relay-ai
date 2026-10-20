"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  LANGUAGES,
  MAX_QUESTIONS_PER_LANGUAGE,
  type FeaturedQuestion,
  type Language,
} from "@/lib/bots/schema";
import type { ErrorKey } from "@/lib/validation/errors";

export function QuestionsEditor({
  questions,
  onChange,
  defaultLanguage,
  serverError,
}: {
  questions: FeaturedQuestion[];
  onChange: (next: FeaturedQuestion[]) => void;
  defaultLanguage: Language;
  serverError?: ErrorKey;
}) {
  const t = useTranslations("Bots.questions");
  const tErrors = useTranslations("Errors");
  const tLocale = useTranslations("Locale");

  const countFor = (lang: Language) => questions.filter((q) => q.language === lang).length;
  // Offer the default language first, then whichever language still has room.
  const nextLanguage = [defaultLanguage, ...LANGUAGES].find(
    (lang) => countFor(lang) < MAX_QUESTIONS_PER_LANGUAGE,
  );

  const update = (index: number, patch: Partial<FeaturedQuestion>) =>
    onChange(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm leading-none font-medium">{t("label")}</legend>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      {questions.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
      <ol className="grid gap-2">
        {questions.map((q, i) => (
          <li key={i} className="flex gap-2">
            <select
              aria-label={t("language", { index: i + 1 })}
              value={q.language}
              onChange={(e) => update(i, { language: e.target.value as Language })}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang.toUpperCase()} · {tLocale(lang)}
                </option>
              ))}
            </select>
            <Input
              aria-label={t("text", { index: i + 1 })}
              value={q.text}
              maxLength={120}
              placeholder={t("placeholder")}
              onChange={(e) => update(i, { text: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("remove", { index: i + 1 })}
              onClick={() => onChange(questions.filter((_, j) => j !== i))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ol>
      {serverError && (
        <p className="text-sm font-medium text-destructive">{tErrors(serverError)}</p>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={!nextLanguage}
        onClick={() =>
          nextLanguage && onChange([...questions, { language: nextLanguage, text: "" }])
        }
      >
        <Plus aria-hidden="true" />
        {t("add")}
      </Button>
    </fieldset>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef } from "react";

import {
  createFaqAction,
  updateFaqAction,
} from "@/app/[locale]/dashboard/bots/[botId]/knowledge/actions";
import { FormField } from "@/components/forms/form-field";
import { FormError } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LANGUAGES, type Language } from "@/lib/bots/schema";
import type { Faq } from "@/lib/faqs/queries";
import { ANSWER_MAX, QUESTION_MAX } from "@/lib/faqs/schema";
import { idle, type FormState } from "@/lib/forms";

type Props = {
  botId: string;
  faq?: Faq;
  defaultLanguage: Language;
  onDone: (state: FormState & { status: "success" }) => void;
  onCancel: () => void;
};

/** Create or edit one FAQ. Uncontrolled fields; values come back from the action on error. */
export function FaqForm({ botId, faq, defaultLanguage, onDone, onCancel }: Props) {
  const t = useTranslations("Knowledge");
  const tLocale = useTranslations("Locale");
  const tErrors = useTranslations("Errors");
  const locale = useLocale();
  const ids = { answer: useId(), language: useId(), featured: useId() };
  const [state, action] = useActionState(faq ? updateFaqAction : createFaqAction, idle);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;
  const handled = useRef<FormState | null>(null);

  useEffect(() => {
    if (state.status === "success" && handled.current !== state) {
      handled.current = state;
      onDone(state);
    }
  }, [state, onDone]);

  // After a failed submit React resets the form, so values come back through `key`.
  const formKey = values ? JSON.stringify(values) : "initial";

  return (
    <form key={formKey} action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="botId" value={botId} />
      {faq && <input type="hidden" name="faqId" value={faq.id} />}
      <FormError error={state.status === "error" ? state.error : undefined} />

      <FormField
        label={t("fields.question")}
        name="question"
        required
        maxLength={QUESTION_MAX}
        defaultValue={values?.question ?? faq?.question ?? ""}
        hint={t("fields.questionHint")}
        error={errors?.question}
        autoFocus
      />

      <div className="grid gap-1.5">
        <Label htmlFor={ids.answer}>{t("fields.answer")}</Label>
        <Textarea
          id={ids.answer}
          name="answer"
          required
          rows={4}
          maxLength={ANSWER_MAX}
          defaultValue={values?.answer ?? faq?.answer ?? ""}
          aria-invalid={errors?.answer ? true : undefined}
          aria-describedby={`${ids.answer}-hint`}
        />
        <p id={`${ids.answer}-hint`} className="text-sm text-muted-foreground">
          {errors?.answer ? (
            <span className="font-medium text-destructive">{tErrors(errors.answer)}</span>
          ) : (
            t("fields.answerHint")
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div className="grid gap-1.5">
          <Label htmlFor={ids.language}>{t("fields.language")}</Label>
          <select
            id={ids.language}
            name="language"
            defaultValue={values?.language ?? faq?.language ?? defaultLanguage}
            className="h-9 w-fit rounded-md border border-input bg-card px-3 text-sm"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {tLocale(l)}
              </option>
            ))}
          </select>
        </div>
        <label htmlFor={ids.featured} className="flex min-h-9 items-center gap-2 text-sm">
          <input
            id={ids.featured}
            type="checkbox"
            name="featured"
            defaultChecked={values ? values.featured === "on" : (faq?.featured ?? false)}
            aria-describedby={`${ids.featured}-hint`}
            className="size-4 accent-primary"
          />
          {t("fields.featured")}
          <span id={`${ids.featured}-hint`} className="sr-only">
            {t("fields.featuredHint")}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton>{faq ? t("save") : t("create")}</SubmitButton>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

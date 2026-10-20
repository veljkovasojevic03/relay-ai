"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useDeferredValue, useEffect, useId, useRef, useState } from "react";

import { importFaqsAction } from "@/app/[locale]/dashboard/bots/[botId]/knowledge/actions";
import { FormError } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LANGUAGES, type Language } from "@/lib/bots/schema";
import { parseFaqImport, type ImportProblem } from "@/lib/faqs/import";
import { IMPORT_MAX } from "@/lib/faqs/schema";
import { idle, type FormState } from "@/lib/forms";

const EXAMPLE = {
  en: "Q: How long does delivery take?\nA: 1–3 working days within Serbia.\n\nQ: Can I return an item?\nA: Yes, within 14 days of delivery.",
  sr: "P: Koliko traje dostava?\nO: 1–3 radna dana u Srbiji.\n\nP: Mogu li da vratim artikal?\nO: Da, u roku od 14 dana od dostave.",
};

type Props = {
  botId: string;
  defaultLanguage: Language;
  onDone: (state: FormState & { status: "success" }) => void;
  onCancel: () => void;
};

/** Paste Q:/A: blocks, preview what was recognized, import in one go. */
export function FaqImport({ botId, defaultLanguage, onDone, onCancel }: Props) {
  const t = useTranslations("Knowledge");
  const tLocale = useTranslations("Locale");
  const locale = useLocale();
  const ids = { text: useId(), language: useId(), preview: useId() };
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const deferred = useDeferredValue(text);
  const { items, problems } = parseFaqImport(deferred);
  const importable = items.slice(0, IMPORT_MAX);
  const [state, action] = useActionState(importFaqsAction, idle);
  const handled = useRef<FormState | null>(null);

  useEffect(() => {
    if (state.status === "success" && handled.current !== state) {
      handled.current = state;
      onDone(state);
    }
  }, [state, onDone]);

  const fieldError =
    state.status === "error" ? (state.fieldErrors?.items ?? state.error) : undefined;

  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="botId" value={botId} />
      <input type="hidden" name="language" value={language} />
      <input type="hidden" name="items" value={JSON.stringify(importable)} />
      <FormError error={fieldError} />

      <p className="text-sm text-muted-foreground">{t("importPanel.hint")}</p>
      <div className="grid gap-1.5">
        <Label htmlFor={ids.text}>{t("importPanel.label")}</Label>
        <Textarea
          id={ids.text}
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE[language]}
          spellCheck
          lang={language}
          aria-describedby={ids.preview}
          className="font-mono text-sm"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={ids.language}>{t("importPanel.language")}</Label>
        <select
          id={ids.language}
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          className="h-9 w-fit rounded-md border border-input bg-card px-3 text-sm"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {tLocale(l)}
            </option>
          ))}
        </select>
      </div>

      <section aria-labelledby={`${ids.preview}-title`} className="grid gap-2">
        <h3 id={`${ids.preview}-title`} className="text-sm font-semibold">
          {t("importPanel.previewTitle")}
        </h3>
        <p id={ids.preview} role="status" className="text-sm text-muted-foreground">
          {t("importPanel.preview", { count: importable.length })}
        </p>
        {importable.length > 0 && (
          <ol className="grid max-h-64 gap-2 overflow-y-auto rounded-lg border bg-background p-3 text-sm">
            {importable.map((item, i) => (
              <li key={i} className="grid gap-0.5">
                <span className="font-medium break-words">{item.question}</span>
                <span className="line-clamp-2 break-words whitespace-pre-line text-muted-foreground">
                  {item.answer}
                </span>
              </li>
            ))}
          </ol>
        )}
        {problems.length > 0 && (
          <div className="grid gap-1 rounded-lg border border-destructive/40 p-3 text-sm">
            <p className="font-medium text-destructive">{t("importPanel.problems")}</p>
            <ul className="list-disc pl-5">
              {problems.slice(0, 10).map((p, i) => (
                <li key={i}>{problemText(t, p)}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <SubmitButton disabled={importable.length === 0}>
          {t("importPanel.submit", { count: importable.length })}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

function problemText(t: ReturnType<typeof useTranslations<"Knowledge">>, p: ImportProblem) {
  switch (p.kind) {
    case "missingAnswer":
      return t("importPanel.missingAnswer", { line: p.line, question: p.question.slice(0, 60) });
    case "tooMany":
      return t("importPanel.tooMany", { max: p.max });
    default:
      return t(`importPanel.${p.kind}`, { line: p.line });
  }
}

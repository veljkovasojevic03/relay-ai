"use client";

import { Bot, CircleAlert, Info, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  testBotAction,
  type PlaygroundResult,
  type PlaygroundState,
} from "@/app/[locale]/dashboard/bots/[botId]/playground/actions";
import { FormError } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LANGUAGES } from "@/lib/bots/schema";
import { QUERY_MAX_LENGTH } from "@/lib/faqs/schema";
import { cn } from "@/lib/utils";

type Props = { botId: string; samples: { question: string; language: string }[] };

const initial: PlaygroundState = { status: "idle" };

export function Playground({ botId, samples }: Props) {
  const t = useTranslations("Playground");
  const tLocale = useTranslations("Locale");
  const locale = useLocale();
  const ids = { question: useId(), language: useId() };
  const [state, action] = useActionState(testBotAction, initial);
  const [question, setQuestion] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const ask = (text: string) => {
    // Render the new value into the input first, so the submitted form carries it.
    flushSync(() => setQuestion(text));
    formRef.current?.requestSubmit();
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid min-w-0 gap-6">
        <form ref={formRef} action={action} className="grid gap-4 rounded-xl border bg-card p-5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="botId" value={botId} />
          <FormError error={state.status === "error" ? state.error : undefined} />
          <div className="grid gap-1.5">
            <Label htmlFor={ids.question}>{t("question")}</Label>
            <Input
              id={ids.question}
              name="question"
              required
              maxLength={QUERY_MAX_LENGTH}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t("placeholder")}
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={ids.language}>{t("language")}</Label>
              <select
                id={ids.language}
                name="language"
                defaultValue="auto"
                className="h-9 w-fit rounded-md border border-input bg-card px-3 text-sm"
              >
                <option value="auto">{t("auto")}</option>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {tLocale(l)}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton>
              <Send aria-hidden="true" />
              {t("submit")}
            </SubmitButton>
          </div>
          {samples.length > 0 && (
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">{t("try")}</p>
              <div className="flex flex-wrap gap-2">
                {samples.map((s) => (
                  <Button
                    key={`${s.language}:${s.question}`}
                    type="button"
                    size="sm"
                    variant="outline"
                    lang={s.language}
                    className="h-auto max-w-full py-1.5 text-left whitespace-normal"
                    onClick={() => ask(s.question)}
                  >
                    {s.question}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </form>

        <div aria-live="polite" className="grid gap-6">
          {state.status === "success" && <Result result={state.result} />}
        </div>
      </div>

      <aside className="grid gap-4 lg:sticky lg:top-6">
        <p className="flex gap-2 rounded-xl border bg-accent p-4 text-sm text-accent-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t("sampleMode")}
        </p>
        {state.status === "success" && <Rule result={state.result} />}
      </aside>
    </div>
  );
}

const percent = (n: number | null) => (n === null ? null : `${Math.round(n * 100)}%`);

function Result({ result }: { result: PlaygroundResult }) {
  const t = useTranslations("Playground");
  const tLocale = useTranslations("Locale");
  const answer = result.matches.find((m) => m.id === result.answerFaqId);
  const suggestions = result.suggestionIds
    .map((id) => result.matches.find((m) => m.id === id))
    .filter((m) => m !== undefined);
  const language = tLocale(result.language);

  return (
    <>
      <section aria-labelledby="pg-reply" className="grid gap-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pg-reply" className="font-semibold">
            {t("result.title")}
          </h2>
          <Badge variant="outline">
            {result.detected
              ? t("result.detected", { language })
              : t("result.language", { language })}
          </Badge>
        </div>
        <p className="text-sm break-words text-muted-foreground">“{result.question}”</p>
        <div className="flex gap-3">
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            <Bot className="size-4" />
          </span>
          <div className="grid min-w-0 gap-2 rounded-2xl rounded-tl-sm bg-muted p-3 text-sm">
            {answer ? (
              <>
                <p lang={answer.language} className="break-words whitespace-pre-line">
                  {answer.answer}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("result.answerSource", { question: answer.question })}
                </p>
              </>
            ) : (
              <>
                <p>{t("result.unknown")}</p>
                {suggestions.length > 0 && (
                  <div className="grid gap-1">
                    <p className="text-xs text-muted-foreground">{t("result.suggestions")}</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <li
                          key={s.id}
                          lang={s.language}
                          className="rounded-full border bg-card px-2.5 py-1 text-xs"
                        >
                          {s.question}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {!answer && <p className="text-sm text-muted-foreground">{t("result.unknownNote")}</p>}
        {!result.semantic && (
          <p role="alert" className="flex gap-2 text-sm font-medium text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("result.textOnly")}
          </p>
        )}
      </section>

      <section aria-labelledby="pg-matches" className="grid gap-3 rounded-xl border bg-card p-5">
        <h2 id="pg-matches" className="font-semibold">
          {t("matches.title")}
        </h2>
        {result.matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("matches.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t("matches.rank")}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t("matches.question")}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    {t("matches.similarity")}
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">
                    {t("matches.keywords")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.matches.map((m, i) => {
                  const used = m.id === result.answerFaqId;
                  return (
                    <tr key={m.id} className={cn("border-b last:border-0", used && "bg-accent")}>
                      <td className="py-2 pr-3 tabular-nums">{i + 1}</td>
                      <td className="py-2 pr-3 break-words" lang={m.language}>
                        {m.question}
                        {used && (
                          <Badge className="ml-2 align-middle">{t("matches.answering")}</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {m.similarity === null ? t("matches.none") : m.similarity.toFixed(3)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {percent(m.keywordOverlap) ?? t("matches.none")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Rule({ result }: { result: PlaygroundResult }) {
  const t = useTranslations("Playground.rule");
  const { settings } = result;
  return (
    <section aria-labelledby="pg-rule" className="grid gap-2 rounded-xl border bg-card p-4">
      <h2 id="pg-rule" className="text-sm font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t("body", {
          threshold: settings.threshold.toFixed(3),
          corroborated: Math.min(settings.corroboratedThreshold, settings.threshold).toFixed(3),
          ranking: settings.hybrid ? t("hybrid") : t("vector"),
        })}
      </p>
    </section>
  );
}

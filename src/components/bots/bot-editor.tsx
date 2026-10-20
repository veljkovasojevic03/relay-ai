"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useId, useState, type ReactNode } from "react";

import { createBotAction, updateBotAction } from "@/app/[locale]/dashboard/bots/actions";
import { FormField } from "@/components/forms/form-field";
import { FormError, FormSuccess } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Bot } from "@/lib/bots/queries";
import {
  DEFAULT_BRAND_COLOR,
  LANGUAGES,
  type FeaturedQuestion,
  type Language,
} from "@/lib/bots/schema";
import { idle } from "@/lib/forms";

import { OriginsEditor } from "./origins-editor";
import { QuestionsEditor } from "./questions-editor";
import { WidgetPreview } from "./widget-preview";

type Draft = {
  name: string;
  description: string;
  defaultLanguage: Language;
  brandColor: string;
  greetingEn: string;
  greetingSr: string;
  position: "left" | "right";
  active: boolean;
  origins: string[];
  questions: FeaturedQuestion[];
};

function initialDraft(bot?: Bot): Draft {
  return {
    name: bot?.name ?? "",
    description: bot?.description ?? "",
    defaultLanguage: bot?.defaultLanguage ?? "en",
    brandColor: bot?.brandColor ?? DEFAULT_BRAND_COLOR,
    greetingEn: bot?.greeting.en ?? "",
    greetingSr: bot?.greeting.sr ?? "",
    position: bot?.position ?? "right",
    active: bot?.active ?? true,
    origins: bot?.allowedOrigins ?? [],
    questions: bot?.featuredQuestions ?? [],
  };
}

/**
 * Create/edit form for a bot with a live preview. Every field is controlled, so the preview
 * follows typing and the draft survives a failed submit (React resets uncontrolled forms).
 */
export function BotEditor({ bot, aside }: { bot?: Bot; aside?: ReactNode }) {
  const t = useTranslations("Bots");
  const tLocale = useTranslations("Locale");
  const tErrors = useTranslations("Errors");
  const locale = useLocale();
  const ids = { description: useId(), language: useId(), color: useId(), active: useId() };
  const [draft, setDraft] = useState(() => initialDraft(bot));
  const [state, action] = useActionState(bot ? updateBotAction : createBotAction, idle);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const questions = draft.questions.filter((q) => q.text.trim());

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form action={action} className="grid min-w-0 gap-6" noValidate>
        <input type="hidden" name="locale" value={locale} />
        {bot && <input type="hidden" name="botId" value={bot.id} />}
        <input type="hidden" name="allowedOrigins" value={JSON.stringify(draft.origins)} />
        <input type="hidden" name="featuredQuestions" value={JSON.stringify(questions)} />
        {draft.active && <input type="hidden" name="active" value="on" />}
        <FormError error={state.status === "error" ? state.error : undefined} />

        <Section title={t("sections.basics")}>
          <FormField
            label={t("fields.name")}
            name="name"
            required
            maxLength={80}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            hint={t("fields.nameHint")}
            error={errors?.name}
          />
          <div className="grid gap-1.5">
            <Label htmlFor={ids.description}>{t("fields.description")}</Label>
            <Textarea
              id={ids.description}
              name="description"
              rows={4}
              maxLength={2000}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              aria-describedby={`${ids.description}-hint`}
            />
            <p id={`${ids.description}-hint`} className="text-sm text-muted-foreground">
              {t("fields.descriptionHint")}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.language}>{t("fields.defaultLanguage")}</Label>
            <select
              id={ids.language}
              name="defaultLanguage"
              value={draft.defaultLanguage}
              onChange={(e) => set("defaultLanguage", e.target.value as Language)}
              aria-describedby={`${ids.language}-hint`}
              className="h-9 w-fit rounded-md border border-input bg-card px-3 text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {tLocale(l)}
                </option>
              ))}
            </select>
            <p id={`${ids.language}-hint`} className="text-sm text-muted-foreground">
              {t("fields.defaultLanguageHint")}
            </p>
          </div>
        </Section>

        <Section title={t("sections.appearance")}>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.color}>{t("fields.brandColor")}</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={t("fields.brandColorPicker")}
                value={
                  /^#[0-9a-f]{6}$/i.test(draft.brandColor) ? draft.brandColor : DEFAULT_BRAND_COLOR
                }
                onChange={(e) => set("brandColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border border-input bg-card p-1"
              />
              <input
                id={ids.color}
                name="brandColor"
                value={draft.brandColor}
                onChange={(e) => set("brandColor", e.target.value)}
                maxLength={7}
                spellCheck={false}
                aria-invalid={errors?.brandColor ? true : undefined}
                aria-describedby={`${ids.color}-hint`}
                className="h-9 w-28 rounded-md border border-input bg-card px-3 font-mono text-sm aria-invalid:border-destructive"
              />
            </div>
            <p id={`${ids.color}-hint`} className="text-sm text-muted-foreground">
              {errors?.brandColor ? (
                <span className="font-medium text-destructive">{tErrors(errors.brandColor)}</span>
              ) : (
                t("fields.brandColorHint")
              )}
            </p>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm leading-none font-medium">{t("fields.position")}</legend>
            <div className="flex gap-4 pt-1">
              {(["left", "right"] as const).map((pos) => (
                <label key={pos} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="position"
                    value={pos}
                    checked={draft.position === pos}
                    onChange={() => set("position", pos)}
                    className="size-4 accent-primary"
                  />
                  {t(`fields.${pos}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </Section>

        <Section title={t("sections.greeting")}>
          <FormField
            label={t("fields.greetingEn")}
            name="greetingEn"
            lang="en"
            maxLength={300}
            value={draft.greetingEn}
            placeholder="Hi! How can I help you today?"
            onChange={(e) => set("greetingEn", e.target.value)}
            error={errors?.greetingEn}
          />
          <FormField
            label={t("fields.greetingSr")}
            name="greetingSr"
            lang="sr"
            maxLength={300}
            value={draft.greetingSr}
            placeholder="Zdravo! Kako mogu da pomognem?"
            onChange={(e) => set("greetingSr", e.target.value)}
            error={errors?.greetingSr}
          />
          <QuestionsEditor
            questions={draft.questions}
            onChange={(q) => set("questions", q)}
            defaultLanguage={draft.defaultLanguage}
            serverError={errors?.featuredQuestions}
          />
        </Section>

        <Section title={t("sections.origins")}>
          <OriginsEditor
            origins={draft.origins}
            onChange={(o) => set("origins", o)}
            serverError={errors?.allowedOrigins}
          />
        </Section>

        <Section title={t("sections.status")}>
          <div className="flex items-start gap-3">
            <Switch
              id={ids.active}
              checked={draft.active}
              onCheckedChange={(v) => set("active", v)}
              aria-describedby={`${ids.active}-hint`}
            />
            <div className="grid gap-1">
              <Label htmlFor={ids.active}>{t("fields.active")}</Label>
              <p id={`${ids.active}-hint`} className="text-sm text-muted-foreground">
                {t("fields.activeHint")}
              </p>
            </div>
          </div>
        </Section>

        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton>{bot ? t("save") : t("create")}</SubmitButton>
          {state.status === "success" && <FormSuccess>{t("saved")}</FormSuccess>}
        </div>
      </form>

      <div className="grid min-w-0 gap-6 lg:sticky lg:top-6">
        <WidgetPreview
          settings={{
            name: draft.name,
            brandColor: draft.brandColor,
            logoUrl: bot?.logoUrl ?? null,
            greeting: { en: draft.greetingEn, sr: draft.greetingSr },
            position: draft.position,
            questions,
            defaultLanguage: draft.defaultLanguage,
          }}
        />
        {aside}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

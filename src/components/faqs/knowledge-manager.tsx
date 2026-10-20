"use client";

import { CircleAlert, Pencil, Plus, RefreshCw, Sparkles, Star, Trash2, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useCallback, useEffect, useId, useRef, useState } from "react";

import {
  addStarterFaqsAction,
  deleteFaqAction,
  reindexFaqsAction,
} from "@/app/[locale]/dashboard/bots/[botId]/knowledge/actions";
import { FormError, FormSuccess } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LANGUAGES, type Language } from "@/lib/bots/schema";
import type { EmbeddingStatus, Faq } from "@/lib/faqs/queries";
import { idle, type FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";

import { FaqForm } from "./faq-form";
import { FaqImport } from "./faq-import";

type Props = { botId: string; defaultLanguage: Language; faqs: Faq[] };
type Panel = "none" | "add" | "import";
type Filter = "all" | Language;
type NoticeKey =
  | "messages.created"
  | "messages.updated"
  | "messages.deleted"
  | "messages.imported"
  | "messages.starters"
  | "messages.embedFailed"
  | "status.reindexed";
type Notice = { key: NoticeKey; count?: number; warn?: boolean } | null;

const ACTION_NOTICES: Record<string, NoticeKey> = {
  created: "messages.created",
  updated: "messages.updated",
  deleted: "messages.deleted",
  imported: "messages.imported",
  starters: "messages.starters",
  reindexed: "status.reindexed",
};

/** Turns an action's success values into the message shown above the list. */
function noticeFrom(state: FormState): Notice {
  if (state.status !== "success" || !state.values) return null;
  const { action, outcome, count } = state.values;
  if (outcome === "embedFailed") return { key: "messages.embedFailed", warn: true };
  const key = action ? ACTION_NOTICES[action] : undefined;
  return key ? { key, count: count ? Number(count) : undefined } : null;
}

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * useActionState that reports success to `onDone`. Lives in a component that stays mounted:
 * a successful action revalidates the page, which can unmount the form that sent it (the
 * empty state, a deleted row) before its own effect would run.
 */
function useReportingAction(action: Action, onDone: (state: FormState) => void) {
  const [state, dispatch] = useActionState(action, idle);
  const handled = useRef<FormState | null>(null);
  useEffect(() => {
    if (state.status === "success" && handled.current !== state) {
      handled.current = state;
      onDone(state);
    }
  }, [state, onDone]);
  return [state, dispatch] as const;
}

export function KnowledgeManager({ botId, defaultLanguage, faqs }: Props) {
  const t = useTranslations("Knowledge");
  const tLocale = useTranslations("Locale");
  const [panel, setPanel] = useState<Panel>("none");
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState<Notice>(null);

  const done = useCallback((state: FormState) => {
    setNotice(noticeFrom(state));
    setPanel("none");
    setEditing(null);
  }, []);
  const close = useCallback(() => {
    setPanel("none");
    setEditing(null);
  }, []);
  const starters = useReportingAction(addStarterFaqsAction, done);
  const remove = useReportingAction(deleteFaqAction, done);

  const shown = filter === "all" ? faqs : faqs.filter((f) => f.language === filter);
  const counts = Object.fromEntries(
    LANGUAGES.map((l) => [l, faqs.filter((f) => f.language === l).length]),
  ) as Record<Language, number>;

  return (
    <div className="grid gap-6">
      <IndexStatus botId={botId} faqs={faqs} onDone={done} />

      <div className="flex flex-wrap gap-2">
        <Button
          variant={panel === "add" ? "secondary" : "default"}
          aria-expanded={panel === "add"}
          onClick={() => {
            setEditing(null);
            setPanel(panel === "add" ? "none" : "add");
          }}
        >
          <Plus aria-hidden="true" />
          {t("add")}
        </Button>
        <Button
          variant="outline"
          aria-expanded={panel === "import"}
          onClick={() => {
            setEditing(null);
            setPanel(panel === "import" ? "none" : "import");
          }}
        >
          <Upload aria-hidden="true" />
          {t("import")}
        </Button>
      </div>

      {notice && (
        <div aria-live="polite">
          {notice.warn ? (
            <p
              role="status"
              className="flex items-center gap-2 text-sm font-medium text-destructive"
            >
              <CircleAlert className="size-4" aria-hidden="true" />
              {t(notice.key, { count: notice.count ?? 0 })}
            </p>
          ) : (
            <FormSuccess>{t(notice.key, { count: notice.count ?? 0 })}</FormSuccess>
          )}
        </div>
      )}

      {panel === "add" && (
        <Panel title={t("add")}>
          <FaqForm botId={botId} defaultLanguage={defaultLanguage} onDone={done} onCancel={close} />
        </Panel>
      )}
      {panel === "import" && (
        <Panel title={t("importPanel.title")}>
          <FaqImport
            botId={botId}
            defaultLanguage={defaultLanguage}
            onDone={done}
            onCancel={close}
          />
        </Panel>
      )}

      {faqs.length === 0 ? (
        <EmptyState botId={botId} defaultLanguage={defaultLanguage} action={starters} />
      ) : (
        <section aria-labelledby="faq-list-title" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="faq-list-title" className="font-semibold">
              {t("count", { count: faqs.length })}
            </h2>
            <div role="group" aria-label={t("filter.label")} className="flex gap-1">
              {(["all", ...LANGUAGES] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "secondary" : "ghost"}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? t("filter.all") : `${tLocale(f)} (${counts[f]})`}
                </Button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              {t("filteredEmpty")}
            </p>
          ) : (
            <ul className="grid gap-3">
              {shown.map((faq) => (
                <li key={faq.id} className="min-w-0 rounded-xl border bg-card p-4">
                  {editing === faq.id ? (
                    <FaqForm
                      botId={botId}
                      faq={faq}
                      defaultLanguage={defaultLanguage}
                      onDone={done}
                      onCancel={close}
                    />
                  ) : (
                    <FaqItem
                      botId={botId}
                      faq={faq}
                      onEdit={() => {
                        setPanel("none");
                        setEditing(faq.id);
                      }}
                      remove={remove}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-xl border bg-card p-5">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

const STATUS_STYLE: Record<EmbeddingStatus, string> = {
  ready: "border-success/40 text-success",
  pending: "border-border text-muted-foreground",
  failed: "border-destructive/50 text-destructive",
};

function StatusBadge({ status }: { status: EmbeddingStatus }) {
  const t = useTranslations("Knowledge.status");
  return (
    <Badge variant="outline" className={STATUS_STYLE[status]}>
      {t(status)}
    </Badge>
  );
}

type ReportingAction = ReturnType<typeof useReportingAction>;

function FaqItem({
  botId,
  faq,
  onEdit,
  remove: [state, action],
}: {
  botId: string;
  faq: Faq;
  onEdit: () => void;
  remove: ReportingAction;
}) {
  const t = useTranslations("Knowledge");
  const locale = useLocale();
  const failed = state.status === "error" && state.values?.faqId === faq.id;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 lang={faq.language} className="min-w-0 flex-1 font-medium break-words">
          {faq.question}
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {faq.featured && (
            <Badge variant="secondary">
              <Star aria-hidden="true" />
              {t("featuredBadge")}
            </Badge>
          )}
          <Badge variant="outline">{faq.language.toUpperCase()}</Badge>
          <StatusBadge status={faq.embeddingStatus} />
        </div>
      </div>
      <p
        lang={faq.language}
        className="line-clamp-3 text-sm break-words whitespace-pre-line text-muted-foreground"
      >
        {faq.answer}
      </p>
      <FormError error={failed ? state.error : undefined} />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          aria-label={t("editLabel", { question: faq.question })}
        >
          <Pencil aria-hidden="true" />
          {t("edit")}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              aria-label={t("deleteLabel", { question: faq.question })}
            >
              <Trash2 aria-hidden="true" />
              {t("delete.confirm")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
              <AlertDialogDescription className="break-words">
                “{faq.question}” — {t("delete.body")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
              <form action={action}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="botId" value={botId} />
                <input type="hidden" name="faqId" value={faq.id} />
                <SubmitButton variant="destructive">{t("delete.confirm")}</SubmitButton>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function IndexStatus({
  botId,
  faqs,
  onDone,
}: {
  botId: string;
  faqs: Faq[];
  onDone: (state: FormState) => void;
}) {
  const t = useTranslations("Knowledge.status");
  const locale = useLocale();
  const [state, action] = useActionState(reindexFaqsAction, idle);
  const handled = useRef<FormState | null>(null);

  useEffect(() => {
    if (state.status === "success" && handled.current !== state) {
      handled.current = state;
      onDone(state);
    }
  }, [state, onDone]);

  if (faqs.length === 0) return null;
  const count = (s: EmbeddingStatus) => faqs.filter((f) => f.embeddingStatus === s).length;
  const failed = count("failed");

  return (
    <section
      aria-labelledby="index-status-title"
      className={cn(
        "grid gap-3 rounded-xl border bg-card p-5",
        failed > 0 && "border-destructive/40",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="index-status-title" className="font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm">
            {t("summary", { ready: count("ready"), pending: count("pending"), failed })}
          </p>
        </div>
        <form action={action}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="botId" value={botId} />
          <SubmitButton variant="outline">
            <RefreshCw aria-hidden="true" />
            {t("reindex")}
          </SubmitButton>
        </form>
      </div>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <FormError error={state.status === "error" ? state.error : undefined} />
    </section>
  );
}

function EmptyState({
  botId,
  defaultLanguage,
  action: [state, action],
}: {
  botId: string;
  defaultLanguage: Language;
  action: ReportingAction;
}) {
  const t = useTranslations("Knowledge.empty");
  const tLocale = useTranslations("Locale");
  const locale = useLocale();
  const id = useId();

  return (
    <section className="grid justify-items-start gap-4 rounded-xl border border-dashed bg-card p-6">
      <Sparkles className="size-6 text-primary" aria-hidden="true" />
      <div className="grid gap-1">
        <h2 className="font-display text-xl font-semibold">{t("title")}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{t("body")}</p>
      </div>
      <FormError error={state.status === "error" ? state.error : undefined} />
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="botId" value={botId} />
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{t("language")}</Label>
          <select
            id={id}
            name="language"
            defaultValue={defaultLanguage}
            className="h-9 w-fit rounded-md border border-input bg-card px-3 text-sm"
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {tLocale(l)}
              </option>
            ))}
          </select>
        </div>
        <SubmitButton>{t("starters")}</SubmitButton>
      </form>
    </section>
  );
}

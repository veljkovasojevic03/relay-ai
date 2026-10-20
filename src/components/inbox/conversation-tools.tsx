"use client";

import { CheckCheck, Send, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  deleteConversationAction,
  markReadAction,
  replyAction,
  resolveAction,
} from "@/app/[locale]/dashboard/inbox/actions";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { idle } from "@/lib/forms";

/** Clears the unread marker while the owner looks at the chat (also for new messages). */
export function MarkRead({ id, unread }: { id: string; unread: boolean }) {
  useEffect(() => {
    if (unread) void markReadAction(id);
  }, [id, unread]);
  return null;
}

export function ReplyForm({ id, disabled }: { id: string; disabled: boolean }) {
  const t = useTranslations("Inbox.reply");
  const tErrors = useTranslations("Errors");
  const locale = useLocale();
  const field = useId();
  const [state, action] = useActionState(replyAction, idle);
  const [draft, setDraft] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const handled = useRef(state);

  // A sent reply clears the box; a failed one keeps what was typed.
  useEffect(() => {
    if (state !== handled.current && state.status === "success") setDraft("");
    handled.current = state;
  }, [state]);

  if (disabled) {
    return <p className="rounded-xl border bg-muted p-4 text-sm">{t("closed")}</p>;
  }
  const error = state.status === "error" ? state.fieldErrors?.content : undefined;

  return (
    <form ref={form} action={action} className="grid gap-2 rounded-xl border bg-card p-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="conversationId" value={id} />
      <FormError error={state.status === "error" ? state.error : undefined} />
      <Label htmlFor={field}>{t("label")}</Label>
      <Textarea
        id={field}
        name="content"
        rows={3}
        maxLength={4000}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) form.current?.requestSubmit();
        }}
        placeholder={t("placeholder")}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${field}-hint`}
      />
      <p id={`${field}-hint`} className="text-sm text-muted-foreground">
        {error ? <span className="font-medium text-destructive">{tErrors(error)}</span> : t("hint")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>
          <Send aria-hidden="true" />
          {t("send")}
        </SubmitButton>
        {state.status === "success" && (
          <FormSuccess>{state.values?.emailed === "yes" ? t("emailed") : t("sent")}</FormSuccess>
        )}
      </div>
    </form>
  );
}

export function ResolveButton({ id }: { id: string }) {
  const t = useTranslations("Inbox");
  const locale = useLocale();
  const [state, action] = useActionState(resolveAction, idle);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="conversationId" value={id} />
      <SubmitButton variant="outline">
        <CheckCheck aria-hidden="true" />
        {t("resolve")}
      </SubmitButton>
      <FormError error={state.status === "error" ? state.error : undefined} />
    </form>
  );
}

export function DeleteConversation({ id }: { id: string }) {
  const t = useTranslations("Inbox.delete");
  const locale = useLocale();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive hover:text-destructive">
          <Trash2 aria-hidden="true" />
          {t("button")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <form action={deleteConversationAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="conversationId" value={id} />
            <SubmitButton variant="destructive">{t("confirm")}</SubmitButton>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

"use client";

import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { deleteBotAction } from "@/app/[locale]/dashboard/bots/actions";
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

export function DeleteBot({ botId, botName }: { botId: string; botName: string }) {
  const t = useTranslations("Bots.danger");
  const locale = useLocale();

  return (
    <section
      aria-labelledby="danger-title"
      className="grid gap-3 rounded-xl border border-destructive/40 bg-card p-5"
    >
      <h2 id="danger-title" className="font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="w-fit">
            <Trash2 aria-hidden="true" />
            {t("button")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle", { name: botName })}</AlertDialogTitle>
            <AlertDialogDescription>{t("body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <form action={deleteBotAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="botId" value={botId} />
              <SubmitButton variant="destructive">{t("confirm")}</SubmitButton>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

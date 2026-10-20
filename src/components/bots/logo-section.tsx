"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useId } from "react";

import { removeLogoAction, uploadLogoAction } from "@/app/[locale]/dashboard/bots/actions";
import { FormError, FormSuccess } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idle } from "@/lib/forms";

export function LogoSection({
  botId,
  botName,
  logoUrl,
}: {
  botId: string;
  botName: string;
  logoUrl: string | null;
}) {
  const t = useTranslations("Bots");
  const tErrors = useTranslations("Errors");
  const locale = useLocale();
  const inputId = useId();
  const [upload, uploadAction] = useActionState(uploadLogoAction, idle);
  const [remove, removeAction] = useActionState(removeLogoAction, idle);
  const fieldError = upload.status === "error" ? upload.fieldErrors?.logo : undefined;

  return (
    <section aria-labelledby="logo-title" className="grid gap-4 rounded-xl border bg-card p-5">
      <h2 id="logo-title" className="font-semibold">
        {t("sections.logo")}
      </h2>
      <div className="flex items-center gap-4">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user logo from Supabase Storage
          <img
            src={logoUrl}
            alt={t("logo.alt", { name: botName })}
            className="size-16 rounded-full border object-cover"
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("logo.none")}</p>
        )}
      </div>

      <form action={uploadAction} className="grid gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="botId" value={botId} />
        <Label htmlFor={inputId}>{logoUrl ? t("logo.replace") : t("logo.upload")}</Label>
        <Input
          id={inputId}
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp"
          aria-describedby={`${inputId}-hint`}
          aria-invalid={fieldError ? true : undefined}
        />
        <p id={`${inputId}-hint`} className="text-sm text-muted-foreground">
          {fieldError ? (
            <span className="font-medium text-destructive">{tErrors(fieldError)}</span>
          ) : (
            t("logo.hint")
          )}
        </p>
        <SubmitButton variant="outline" className="w-fit">
          <ImageUp aria-hidden="true" />
          {logoUrl ? t("logo.replace") : t("logo.upload")}
        </SubmitButton>
        <FormError error={upload.status === "error" ? upload.error : undefined} />
        {upload.status === "success" && logoUrl && <FormSuccess>{t("logo.uploaded")}</FormSuccess>}
      </form>

      {logoUrl && (
        <form action={removeAction}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="botId" value={botId} />
          <SubmitButton variant="ghost" className="w-fit">
            <Trash2 aria-hidden="true" />
            {t("logo.remove")}
          </SubmitButton>
          <FormError error={remove.status === "error" ? remove.error : undefined} />
        </form>
      )}
      {remove.status === "success" && !logoUrl && <FormSuccess>{t("logo.removed")}</FormSuccess>}
    </section>
  );
}

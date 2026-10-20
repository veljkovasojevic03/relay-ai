"use client";

import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormField } from "@/components/forms/form-field";
import { FormError } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { idle } from "@/lib/forms";

import { forgotPasswordAction } from "../actions";

export function ForgotForm() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const [state, action] = useActionState(forgotPasswordAction, idle);

  if (state.status === "success") {
    return (
      <div role="status" className="grid justify-items-start gap-2">
        <MailCheck className="size-6 text-success" aria-hidden="true" />
        <h2 className="font-semibold">{t("forgot.sentTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("forgot.sentBody", { email: state.values?.email ?? "" })}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <FormError error={state.status === "error" ? state.error : undefined} />
      <FormField
        label={t("fields.email")}
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.status === "error" ? state.values?.email : undefined}
        error={state.status === "error" ? state.fieldErrors?.email : undefined}
      />
      <SubmitButton className="w-full">{t("forgot.submit")}</SubmitButton>
    </form>
  );
}

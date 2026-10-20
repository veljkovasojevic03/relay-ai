"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormField } from "@/components/forms/form-field";
import { FormError } from "@/components/forms/form-message";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { idle } from "@/lib/forms";

import { resetPasswordAction } from "../actions";

export function ResetForm() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const [state, action] = useActionState(resetPasswordAction, idle);
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <FormError error={state.status === "error" ? state.error : undefined} />
      <FormField
        label={t("fields.password")}
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={72}
        hint={t("fields.passwordHint")}
        error={errors?.password}
        control={(props) => <PasswordInput {...props} />}
      />
      <FormField
        label={t("fields.confirmPassword")}
        name="confirmPassword"
        autoComplete="new-password"
        required
        error={errors?.confirmPassword}
        control={(props) => <PasswordInput {...props} />}
      />
      <SubmitButton className="w-full">{t("reset.submit")}</SubmitButton>
    </form>
  );
}

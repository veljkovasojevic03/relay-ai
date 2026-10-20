"use client";

import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormField } from "@/components/forms/form-field";
import { FormError } from "@/components/forms/form-message";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { idle } from "@/lib/forms";

import { signUpAction } from "../actions";

export function SignupForm() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const [state, action] = useActionState(signUpAction, idle);

  if (state.status === "success") {
    return (
      <div role="status" className="grid justify-items-start gap-2">
        <MailCheck className="size-6 text-success" aria-hidden="true" />
        <h2 className="font-semibold">{t("signup.checkEmailTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("signup.checkEmailBody", { email: state.values?.email ?? "" })}
        </p>
      </div>
    );
  }

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <FormError error={state.status === "error" ? state.error : undefined} />
      <FormField
        label={t("fields.displayName")}
        name="displayName"
        autoComplete="name"
        optional
        maxLength={80}
        defaultValue={values?.displayName}
        error={errors?.displayName}
      />
      <FormField
        label={t("fields.email")}
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={values?.email}
        error={errors?.email}
      />
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
      <SubmitButton className="w-full">{t("signup.submit")}</SubmitButton>
    </form>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormField } from "@/components/forms/form-field";
import { FormError, FormSuccess } from "@/components/forms/form-message";
import { PasswordInput } from "@/components/forms/password-input";
import { SubmitButton } from "@/components/forms/submit-button";
import { Link } from "@/i18n/navigation";
import { idle } from "@/lib/forms";
import type { ErrorKey } from "@/lib/validation/auth";

import { signInAction } from "../actions";

export function LoginForm({
  next,
  initialError,
  emailConfirmed = false,
}: {
  next?: string;
  initialError?: ErrorKey;
  emailConfirmed?: boolean;
}) {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const [state, action] = useActionState(signInAction, idle);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const formError =
    state.status === "error" ? state.error : state.status === "idle" ? initialError : undefined;

  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {next && <input type="hidden" name="next" value={next} />}
      <FormError error={formError} />
      {emailConfirmed && state.status === "idle" && (
        <FormSuccess>{t("login.emailConfirmed")}</FormSuccess>
      )}
      <FormField
        label={t("fields.email")}
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.status === "error" ? state.values?.email : undefined}
        error={errors?.email}
      />
      <div className="grid gap-1.5">
        <FormField
          label={t("fields.password")}
          name="password"
          autoComplete="current-password"
          required
          error={errors?.password}
          control={(props) => <PasswordInput {...props} />}
        />
        <Link
          href="/forgot-password"
          className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("login.forgot")}
        </Link>
      </div>
      <SubmitButton className="w-full">{t("login.submit")}</SubmitButton>
    </form>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useId } from "react";

import { FormField } from "@/components/forms/form-field";
import { FormError, FormSuccess } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import { routing } from "@/i18n/routing";
import { idle } from "@/lib/forms";
import type { OwnerProfile } from "@/lib/auth/session";

import { updateProfileAction } from "./actions";

export function AccountForm({ profile }: { profile: OwnerProfile }) {
  const t = useTranslations();
  const locale = useLocale();
  const languageId = useId();
  const [state, action] = useActionState(updateProfileAction, idle);
  const errors = state.status === "error" ? state.fieldErrors : undefined;
  // After an error, show what the owner typed; otherwise the saved profile.
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={action} className="grid max-w-lg gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <FormError error={state.status === "error" ? state.error : undefined} />
      <FormField
        label={t("Account.displayName")}
        name="displayName"
        autoComplete="name"
        maxLength={80}
        defaultValue={values?.displayName ?? profile.displayName ?? ""}
        error={errors?.displayName}
      />
      <div className="grid gap-1.5">
        <Label htmlFor={languageId}>{t("Account.uiLanguage")}</Label>
        <select
          id={languageId}
          name="uiLanguage"
          defaultValue={values?.uiLanguage ?? profile.uiLanguage}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {routing.locales.map((l) => (
            <option key={l} value={l}>
              {t(`Locale.${l}`)}
            </option>
          ))}
        </select>
      </div>
      <FormField
        label={t("Account.notificationEmail")}
        name="notificationEmail"
        type="email"
        autoComplete="email"
        required
        hint={t("Account.notificationHint")}
        defaultValue={values?.notificationEmail ?? profile.notificationEmail ?? ""}
        error={errors?.notificationEmail}
      />
      <div className="flex items-center gap-4">
        <SubmitButton>{t("Account.save")}</SubmitButton>
        {state.status === "success" && <FormSuccess>{t("Account.saved")}</FormSuccess>}
      </div>
    </form>
  );
}

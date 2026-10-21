import { useTranslations } from "next-intl";

import type { Locale } from "@/i18n/routing";

import { LocaleLinks } from "./locale-links";

/**
 * Plain links on purpose: a client-side navigation between locales keeps the old
 * `<html lang>`, so screen readers would read the new language with the old voice. A full
 * page load renders the root layout fresh.
 *
 * Always prefixed (also `/en/...`): an unprefixed URL would be redirected back by the old
 * locale cookie. The proxy stores the new choice and drops the default prefix.
 */
export function LocaleSwitcher() {
  const t = useTranslations();
  // Labels come from the server, so the client part needs no message formatting code.
  return (
    <LocaleLinks
      label={t("Header.language")}
      names={{ en: t("Locale.en"), sr: t("Locale.sr") } satisfies Record<Locale, string>}
    />
  );
}

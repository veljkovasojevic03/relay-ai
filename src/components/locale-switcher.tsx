"use client";

import { useLocale, useTranslations } from "next-intl";

import { usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

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
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("Header.language")}>
      <ul className="flex items-center gap-1 rounded-full border bg-card p-1 text-sm">
        {routing.locales.map((locale) => (
          <li key={locale}>
            <a
              href={`/${locale}${pathname === "/" ? "" : pathname}`}
              hrefLang={locale}
              lang={locale}
              aria-current={locale === current ? "true" : undefined}
              className={cn(
                "inline-flex min-h-8 items-center rounded-full px-2.5 font-medium transition-colors sm:px-3",
                locale === current
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {/* Short code on narrow screens; the accessible name stays the full language. */}
              <span aria-hidden="true" className="uppercase sm:hidden">
                {locale}
              </span>
              <span className="max-sm:sr-only">{t(`Locale.${locale}`)}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

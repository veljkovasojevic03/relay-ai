"use client";

import { useLocale, useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LocaleSwitcher() {
  const t = useTranslations();
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("Header.language")}>
      <ul className="flex items-center gap-1 rounded-full border bg-card p-1 text-sm">
        {routing.locales.map((locale) => (
          <li key={locale}>
            <Link
              href={pathname}
              locale={locale}
              hrefLang={locale}
              lang={locale}
              aria-current={locale === current ? "true" : undefined}
              className={cn(
                "inline-flex min-h-8 items-center rounded-full px-3 font-medium transition-colors",
                locale === current
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`Locale.${locale}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

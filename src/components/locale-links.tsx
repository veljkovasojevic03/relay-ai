"use client";

import { useLocale } from "next-intl";

import { usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** The client half of LocaleSwitcher: it needs the current path. */
export function LocaleLinks({ label, names }: { label: string; names: Record<Locale, string> }) {
  const current = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={label}>
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
              <span className="max-sm:sr-only">{names[locale]}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

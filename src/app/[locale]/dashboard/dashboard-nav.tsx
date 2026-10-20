"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", key: "overview" },
  { href: "/dashboard/account", key: "account" },
] as const;

export function DashboardNav() {
  const t = useTranslations("Dashboard.nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="-mb-px">
      <ul className="flex items-center gap-1">
        {items.map(({ href, key }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

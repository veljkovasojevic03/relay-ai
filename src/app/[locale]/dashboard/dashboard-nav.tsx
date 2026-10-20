"use client";

import { Bot, Inbox, LayoutDashboard, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", key: "overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/inbox", key: "inbox", icon: Inbox, exact: false },
  { href: "/dashboard/bots", key: "bots", icon: Bot, exact: false },
  { href: "/dashboard/account", key: "account", icon: UserRound, exact: true },
] as const;

/** Horizontal tabs on small screens, a vertical sidebar from `lg` up. */
export function DashboardNav({ unread = 0 }: { unread?: number }) {
  const t = useTranslations("Dashboard.nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")}>
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {items.map(({ href, key, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {t(key)}
                {key === "inbox" && unread > 0 && (
                  <span className="ml-auto rounded-full bg-primary px-1.5 text-xs leading-5 font-semibold text-primary-foreground tabular-nums">
                    {unread}
                    <span className="sr-only"> {t("unread", { count: unread })}</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

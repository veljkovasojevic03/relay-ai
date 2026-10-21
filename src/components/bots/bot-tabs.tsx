"use client";

import { BookOpen, FlaskConical, Settings2, Zap } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/** Sections of one bot: settings, knowledge (FAQ), the test playground and actions. */
export function BotTabs({ botId }: { botId: string }) {
  const t = useTranslations("Bots.tabs");
  const pathname = usePathname();
  const base = `/dashboard/bots/${botId}`;
  const items = [
    { href: base, key: "settings", icon: Settings2 },
    { href: `${base}/knowledge`, key: "knowledge", icon: BookOpen },
    { href: `${base}/playground`, key: "playground", icon: FlaskConical },
    { href: `${base}/actions`, key: "actions", icon: Zap },
  ] as const;

  return (
    <nav aria-label={t("label")} className="min-w-0">
      <ul className="flex gap-1 overflow-x-auto border-b">
        {items.map(({ href, key, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

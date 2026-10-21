import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Webhook } from "lucide-react";

import { EventStatusBadge } from "@/components/actions/status-badges";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/routing";
import {
  EVENT_STATUSES,
  listEvents,
  parseEventFilter,
  type OutboxEvent,
} from "@/lib/actions/queries";
import { serverEnv } from "@/lib/env.server";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/events">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Events" });
  return { title: t("metaTitle") };
}

/** Message keys can't contain dots: `action.order_status` → `order_status`. */
const typeKey = (type: OutboxEvent["type"]) =>
  type === "action.order_status"
    ? "order_status"
    : type === "action.create_ticket"
      ? "create_ticket"
      : type;

/** Event log (spec §8): every n8n-bound event of this owner, simulated ones labeled. */
export default async function EventsPage({
  searchParams,
}: PageProps<"/[locale]/dashboard/events">) {
  const filter = parseEventFilter((await searchParams).status);
  const [events, t, format] = await Promise.all([
    listEvents(filter),
    getTranslations("Events"),
    getFormatter(),
  ]);
  const simulatedMode = serverEnv().N8N_MODE === "simulated";
  const now = new Date();

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-prose text-muted-foreground">{t("subtitle")}</p>
      </div>

      <p role="note" className="max-w-prose rounded-xl border bg-card p-4 text-sm">
        {simulatedMode ? t("mode.simulated") : t("mode.real")}
      </p>

      <nav aria-label={t("filters.label")}>
        <ul className="flex flex-wrap gap-1">
          {[undefined, ...EVENT_STATUSES].map((s) => (
            <li key={s ?? "all"}>
              <Link
                href={s ? `/dashboard/events?status=${s}` : "/dashboard/events"}
                aria-current={filter === s ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium",
                  filter === s
                    ? "border-foreground bg-foreground text-background"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {s ? t(`status.${s}`) : t("filters.all")}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {events.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-xl border border-dashed bg-card p-6">
          <Webhook className="size-6 text-primary" aria-hidden="true" />
          <p className="max-w-prose text-sm text-muted-foreground">
            {filter ? t("emptyFiltered") : t("empty")}
          </p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {events.map((e) => (
            <li key={e.id} className="grid gap-1.5 rounded-xl border bg-card p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t(`types.${typeKey(e.type)}`)}</span>
                <EventStatusBadge status={e.status} />
                {e.botName && <span className="text-muted-foreground">{e.botName}</span>}
                <time dateTime={e.createdAt} className="ml-auto text-xs text-muted-foreground">
                  {format.relativeTime(new Date(e.createdAt), now)}
                </time>
              </div>
              <p className="text-xs text-muted-foreground">
                {e.status === "simulated"
                  ? e.type.startsWith("action.")
                    ? t("explain.simulatedAction")
                    : t("explain.simulatedEmail")
                  : e.status === "pending"
                    ? e.attempts > 0
                      ? t("explain.retrying", {
                          attempts: e.attempts,
                          next: format.relativeTime(new Date(e.nextAttemptAt), now),
                        })
                      : t("explain.queued")
                    : t(`explain.${e.status}`)}
              </p>
              {e.lastError && (
                <p className="text-xs break-words text-destructive">
                  {t("lastError", { error: e.lastError })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

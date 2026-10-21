import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Inbox as InboxIcon } from "lucide-react";

import { InboxLive } from "@/components/inbox/inbox-live";
import { StatusBadge } from "@/components/inbox/status-badge";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/routing";
import { getInboxCounts, INBOX_FILTERS, listConversations, parseFilter } from "@/lib/inbox/queries";
import { realtimeProps } from "@/lib/inbox/realtime";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/inbox">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Inbox" });
  return { title: t("metaTitle") };
}

export default async function InboxPage({ searchParams }: PageProps<"/[locale]/dashboard/inbox">) {
  const filter = parseFilter((await searchParams).status);
  const [conversations, counts, t, format] = await Promise.all([
    listConversations(filter),
    getInboxCounts(),
    getTranslations("Inbox"),
    getFormatter(),
  ]);
  const now = new Date();

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <InboxLive realtime={realtimeProps()} />
      </div>

      <nav aria-label={t("filters.label")}>
        <ul className="flex flex-wrap gap-1">
          {INBOX_FILTERS.map((f) => {
            const count =
              f === "waiting_human" ? counts.waiting : f === "human" ? counts.human : null;
            return (
              <li key={f}>
                <Link
                  href={f === "all" ? "/dashboard/inbox" : `/dashboard/inbox?status=${f}`}
                  aria-current={filter === f ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium",
                    filter === f
                      ? "border-foreground bg-foreground text-background"
                      : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`filters.${f}`)}
                  {count ? <span className="tabular-nums">({count})</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {conversations.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-xl border border-dashed bg-card p-6">
          <InboxIcon className="size-6 text-primary" aria-hidden="true" />
          <p className="max-w-prose text-sm text-muted-foreground">{t(`empty.${filter}`)}</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {conversations.map((c) => {
            const who = c.visitorEmail ?? t("anonymous");
            return (
              <li
                key={c.id}
                className={cn(
                  "relative grid gap-1.5 rounded-xl border bg-card p-4 transition-colors focus-within:border-primary hover:border-primary",
                  c.unread && "border-primary/50",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {c.unread && (
                    <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />
                  )}
                  {/* The link's name is "Open the chat with <who>"; its ::after covers the card. */}
                  <Link
                    href={`/dashboard/inbox/${c.id}`}
                    className={cn(
                      "min-w-0 truncate rounded-sm after:absolute after:inset-0 after:rounded-xl",
                      c.unread && "font-semibold",
                    )}
                  >
                    {t.rich("open", {
                      who,
                      hidden: (chunks) => <span className="sr-only">{chunks}</span>,
                    })}
                  </Link>
                  <StatusBadge status={c.status} />
                  {c.unread && <span className="sr-only">{t("unread")}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    <time dateTime={c.lastMessageAt}>
                      {format.relativeTime(new Date(c.lastMessageAt), now)}
                    </time>
                  </span>
                </div>
                <p className="line-clamp-1 text-sm break-words text-muted-foreground">
                  {c.previewRole && (
                    <span className="font-medium text-foreground">
                      {t(`roles.${c.previewRole}`)}:{" "}
                    </span>
                  )}
                  {c.preview}
                </p>
                <p className="text-xs text-muted-foreground">{c.botName}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

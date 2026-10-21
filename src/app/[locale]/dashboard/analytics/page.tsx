import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ChartColumn, CircleHelp, Plus, X } from "lucide-react";
import type { ReactNode } from "react";

import { ConversationsChart } from "@/components/analytics/conversations-chart";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/routing";
import { getSummary, listUnknownQuestions } from "@/lib/analytics/queries";
import { parseRange, percent, RANGES, type Range } from "@/lib/analytics/summary";
import { listBots } from "@/lib/bots/queries";
import { cn } from "@/lib/utils";

import { dismissUnknownAction } from "./actions";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/analytics">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Analytics" });
  return { title: t("metaTitle") };
}

/** Analytics (spec §4.8): numbers from SQL, and the questions the bot couldn't answer. */
export default async function AnalyticsPage({
  searchParams,
}: PageProps<"/[locale]/dashboard/analytics">) {
  const query = await searchParams;
  const days = parseRange(query.days);
  const bots = await listBots();
  const bot = bots.find((b) => b.id === query.bot) ?? null;
  const [t, format, locale] = await Promise.all([
    getTranslations("Analytics"),
    getFormatter(),
    getLocale(),
  ]);

  if (bots.length === 0) {
    return (
      <Page title={t("title")} subtitle={t("subtitle")}>
        <div className="grid justify-items-start gap-3 rounded-xl border border-dashed bg-card p-6">
          <ChartColumn className="size-6 text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t("noBots")}</p>
          <Link
            href="/dashboard/bots/new"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("createBot")}
          </Link>
        </div>
      </Page>
    );
  }

  const [summary, unknown] = await Promise.all([
    getSummary(bot?.id ?? null, days),
    listUnknownQuestions(bot?.id ?? null),
  ]);
  const { totals } = summary;
  const rated = totals.ratingsUp + totals.ratingsDown;
  const botNames = new Map(bots.map((b) => [b.id, b.name]));
  const href = (next: { bot?: string | null; days?: Range }) => {
    const params = new URLSearchParams();
    const botId = next.bot === undefined ? bot?.id : next.bot;
    if (botId) params.set("bot", botId);
    params.set("days", String(next.days ?? days));
    return `/dashboard/analytics?${params}`;
  };
  const number = (n: number) => format.number(n);
  const seconds = (ms: number) =>
    format.number(ms / 1000, { maximumFractionDigits: ms < 10_000 ? 1 : 0 });
  const now = new Date();

  return (
    <Page title={t("title")} subtitle={t("subtitle")}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {bots.length > 1 && (
          <Pills label={t("filters.bot")}>
            <Pill href={href({ bot: null })} current={!bot}>
              {t("filters.allBots")}
            </Pill>
            {bots.map((b) => (
              <Pill key={b.id} href={href({ bot: b.id })} current={bot?.id === b.id}>
                {b.name}
              </Pill>
            ))}
          </Pills>
        )}
        <Pills label={t("filters.range")}>
          {RANGES.map((r) => (
            <Pill key={r} href={href({ days: r })} current={r === days}>
              {t("filters.days", { days: r })}
            </Pill>
          ))}
        </Pills>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("stats.conversations")} value={number(totals.conversations)} />
        <Stat
          label={t("stats.resolvedByBot")}
          value={
            percent(totals.resolvedByBot, totals.conversations) === null
              ? "–"
              : `${percent(totals.resolvedByBot, totals.conversations)}%`
          }
          note={t("stats.handedOff", { count: totals.handedOff })}
        />
        <Stat
          label={t("stats.firstResponse")}
          value={
            totals.avgFirstResponseMs === null
              ? "–"
              : t("stats.seconds", { value: seconds(totals.avgFirstResponseMs) })
          }
        />
        <Stat
          label={t("stats.thumbsUp")}
          value={rated === 0 ? "–" : `${percent(totals.ratingsUp, rated)}%`}
          note={
            rated === 0
              ? t("stats.noRatings")
              : t("stats.ratings", { up: totals.ratingsUp, down: totals.ratingsDown })
          }
        />
      </dl>

      <section aria-labelledby="per-day" className="grid gap-4 rounded-xl border bg-card p-5">
        <div className="grid gap-1">
          <h2 id="per-day" className="font-semibold">
            {t("chart.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("chart.subtitle", { days, bot: bot?.name ?? t("chart.allBots") })}
          </p>
        </div>
        {totals.conversations === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            {t("chart.empty")}
          </p>
        ) : (
          <ConversationsChart daily={summary.daily} />
        )}
      </section>

      <section aria-labelledby="unknown" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="unknown" className="font-semibold">
            {t("unknown.title")}
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">{t("unknown.subtitle")}</p>
        </div>
        {unknown.length === 0 ? (
          <div className="grid justify-items-start gap-3 rounded-xl border border-dashed bg-card p-6">
            <CircleHelp className="size-6 text-primary" aria-hidden="true" />
            <p className="max-w-prose text-sm text-muted-foreground">{t("unknown.empty")}</p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {unknown.map((q) => (
              <li key={q.ids[0]} className="grid gap-3 rounded-xl border bg-card p-4">
                <div className="grid gap-1.5">
                  <p className="font-medium break-words">“{q.question}”</p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{q.language.toUpperCase()}</Badge>
                    {q.count > 1 && <span>{t("unknown.asked", { count: q.count })}</span>}
                    {!bot && bots.length > 1 && <span>{botNames.get(q.botId)}</span>}
                    <time dateTime={q.lastAskedAt}>
                      {format.relativeTime(new Date(q.lastAskedAt), now)}
                    </time>
                  </p>
                </div>
                {q.suggestedAnswer ? (
                  <div className="grid gap-1 rounded-lg bg-muted p-3 text-sm">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t(`unknown.source.${q.suggestionSource}`)}
                    </p>
                    <p className="line-clamp-4 break-words whitespace-pre-line">
                      {q.suggestedAnswer}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("unknown.noDraft")}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboard/bots/${q.botId}/knowledge?fromUnknown=${q.ids[0]}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {t("unknown.add")}
                  </Link>
                  <form action={dismissUnknownAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="ids" value={q.ids.join(",")} />
                    <SubmitButton
                      variant="ghost"
                      aria-label={t("unknown.dismissLabel", { question: q.question })}
                    >
                      <X aria-hidden="true" />
                      {t("unknown.dismiss")}
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}

function Page({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-prose text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Pills({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1">{children}</ul>
    </nav>
  );
}

function Pill({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={cn(
          "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium",
          current
            ? "border-foreground bg-foreground text-background"
            : "bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        {children}
      </Link>
    </li>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-xl border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-3xl font-semibold tracking-tight tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ActionToggles } from "@/components/actions/action-toggles";
import { RunStatusBadge } from "@/components/actions/status-badges";
import { BotHeader } from "@/components/bots/bot-header";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/routing";
import { ACTION_NAMES, type ActionName } from "@/lib/actions/flow";
import { getBotActions } from "@/lib/actions/queries";
import { getBot } from "@/lib/bots/queries";

const isActionName = (name: string): name is ActionName =>
  (ACTION_NAMES as readonly string[]).includes(name);

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/bots/[botId]/actions">): Promise<Metadata> {
  const { locale, botId } = await params;
  const [bot, t] = await Promise.all([
    getBot(botId),
    getTranslations({ locale: asLocale(locale), namespace: "Actions" }),
  ]);
  return { title: bot ? `${t("metaTitle")} · ${bot.name}` : t("metaTitle") };
}

export default async function BotActionsPage({
  params,
}: PageProps<"/[locale]/dashboard/bots/[botId]/actions">) {
  const { botId } = await params;
  const [bot, t, format] = await Promise.all([
    getBot(botId),
    getTranslations("Actions"),
    getFormatter(),
  ]);
  if (!bot) notFound();
  const { actions, runs } = await getBotActions(bot.id);
  const now = new Date();

  return (
    <div className="grid gap-6">
      <BotHeader bot={bot} />
      <div className="grid gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight">{t("title")}</h2>
        <p className="max-w-prose text-muted-foreground">{t("subtitle")}</p>
      </div>

      <ActionToggles botId={bot.id} actions={actions} />

      <section className="grid gap-3" aria-labelledby="runs-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 id="runs-heading" className="text-lg font-semibold">
            {t("runs.title")}
          </h3>
          <Link
            href="/dashboard/events"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("runs.eventLog")}
          </Link>
        </div>
        {runs.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
            {t("runs.empty")}
          </p>
        ) : (
          <ul className="grid gap-2">
            {runs.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-card p-3 text-sm"
              >
                <span className="font-medium">
                  {isActionName(run.action) ? t(`names.${run.action}`) : run.action}
                </span>
                <RunStatusBadge status={run.status} />
                {run.simulated && <Badge variant="outline">{t("simulated")}</Badge>}
                {run.durationMs !== null && (
                  <span className="text-muted-foreground tabular-nums">
                    {t("runs.duration", { ms: run.durationMs })}
                  </span>
                )}
                <time dateTime={run.createdAt} className="ml-auto text-xs text-muted-foreground">
                  {format.relativeTime(new Date(run.createdAt), now)}
                </time>
                {run.error && (
                  <p className="w-full text-xs break-words text-destructive">
                    {t("runs.error", { error: run.error })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

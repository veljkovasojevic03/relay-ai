import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Bot as BotIcon, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/routing";
import { getBotQuota, listBots } from "@/lib/bots/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/bots">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Bots" });
  return { title: t("metaTitle") };
}

export default async function BotsPage() {
  const [bots, quota, t] = await Promise.all([listBots(), getBotQuota(), getTranslations()]);
  const plan = t(`Dashboard.overview.plans.${quota.plan}`);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">{t("Bots.title")}</h1>
          <p className="text-muted-foreground">{t("Bots.subtitle")}</p>
        </div>
        {quota.canCreate && bots.length > 0 && (
          <Link href="/dashboard/bots/new" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            {t("Bots.new")}
          </Link>
        )}
      </div>

      {bots.length === 0 ? (
        <EmptyState
          title={t("Bots.empty.title")}
          body={t("Bots.empty.body")}
          cta={t("Bots.empty.cta")}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t("Bots.usage", { count: quota.count, limit: quota.limit, plan })}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {bots.map((bot) => (
              <li key={bot.id} className="min-w-0">
                <Link
                  href={`/dashboard/bots/${bot.id}`}
                  aria-label={t("Bots.card.edit", { name: bot.name })}
                  className="grid gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="size-9 shrink-0 rounded-full border"
                      style={{ background: bot.brandColor }}
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold">{bot.name}</span>
                    <Badge variant={bot.active ? "secondary" : "outline"}>
                      {bot.active ? t("Bots.card.active") : t("Bots.card.paused")}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("Bots.card.origins", { count: bot.allowedOrigins.length })}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {!quota.canCreate && (
            <p
              role="note"
              className="rounded-xl border bg-accent p-4 text-sm text-accent-foreground"
            >
              {t("Bots.limitReached", { plan, limit: quota.limit })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div className="grid justify-items-start gap-3 rounded-xl border border-dashed bg-card p-8">
      <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
        <BotIcon className="size-5" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-prose text-muted-foreground">{body}</p>
      <Link href="/dashboard/bots/new" className={buttonVariants()}>
        <Plus aria-hidden="true" />
        {cta}
      </Link>
    </div>
  );
}

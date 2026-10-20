import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { BotHeader } from "@/components/bots/bot-header";
import { Playground } from "@/components/faqs/playground";
import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/routing";
import { getBot } from "@/lib/bots/queries";
import { embeddingSummary, listFaqs } from "@/lib/faqs/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/bots/[botId]/playground">): Promise<Metadata> {
  const { locale, botId } = await params;
  const [bot, t] = await Promise.all([
    getBot(botId),
    getTranslations({ locale: asLocale(locale), namespace: "Playground" }),
  ]);
  return { title: bot ? `${t("metaTitle")} · ${bot.name}` : t("metaTitle") };
}

export default async function PlaygroundPage({
  params,
}: PageProps<"/[locale]/dashboard/bots/[botId]/playground">) {
  const { botId } = await params;
  const [bot, t] = await Promise.all([getBot(botId), getTranslations()]);
  if (!bot) notFound();
  const faqs = await listFaqs(bot.id);
  const summary = embeddingSummary(faqs);
  const notIndexed = summary.pending + summary.failed;
  // A few of the owner's own questions as one-click examples, both languages if present.
  const samples = [...faqs]
    .sort((a, b) => Number(b.featured) - Number(a.featured))
    .filter((f, i, all) => all.findIndex((g) => g.language === f.language) === i || i < 4)
    .slice(0, 4)
    .map((f) => ({ question: f.question, language: f.language }));

  return (
    <div className="grid gap-6">
      <BotHeader bot={bot} />
      <div className="grid gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {t("Playground.title")}
        </h2>
        <p className="max-w-prose text-muted-foreground">{t("Playground.subtitle")}</p>
      </div>
      {faqs.length === 0 ? (
        <p className="grid justify-items-start gap-3 rounded-xl border border-dashed bg-card p-6 text-sm">
          {t("Playground.noFaqs")}
          <Link
            href={`/dashboard/bots/${bot.id}/knowledge`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("Bots.tabs.knowledge")}
          </Link>
        </p>
      ) : (
        <>
          {notIndexed > 0 && (
            <p role="note" className="rounded-xl border border-destructive/40 bg-card p-4 text-sm">
              {t("Playground.notIndexed", { count: notIndexed })}{" "}
              <Link
                href={`/dashboard/bots/${bot.id}/knowledge`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("Knowledge.status.reindex")}
              </Link>
            </p>
          )}
          <Playground botId={bot.id} samples={samples} />
        </>
      )}
    </div>
  );
}

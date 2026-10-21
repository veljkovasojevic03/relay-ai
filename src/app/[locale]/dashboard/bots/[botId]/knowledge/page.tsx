import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { BotHeader } from "@/components/bots/bot-header";
import { KnowledgeManager } from "@/components/faqs/knowledge-manager";
import { asLocale } from "@/i18n/routing";
import { getFaqDraft } from "@/lib/analytics/queries";
import { getBot } from "@/lib/bots/queries";
import { listFaqs } from "@/lib/faqs/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/bots/[botId]/knowledge">): Promise<Metadata> {
  const { locale, botId } = await params;
  const [bot, t] = await Promise.all([
    getBot(botId),
    getTranslations({ locale: asLocale(locale), namespace: "Knowledge" }),
  ]);
  return { title: bot ? `${t("metaTitle")} · ${bot.name}` : t("metaTitle") };
}

export default async function KnowledgePage({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/bots/[botId]/knowledge">) {
  const { botId } = await params;
  const [bot, t] = await Promise.all([getBot(botId), getTranslations("Knowledge")]);
  if (!bot) notFound();
  // Analytics → "Add to FAQ" links here with the unknown question to answer.
  const [faqs, draft] = await Promise.all([
    listFaqs(bot.id),
    getFaqDraft(bot.id, (await searchParams).fromUnknown),
  ]);

  return (
    <div className="grid gap-6">
      <BotHeader bot={bot} />
      <div className="grid gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight">{t("title")}</h2>
        <p className="max-w-prose text-muted-foreground">{t("subtitle")}</p>
      </div>
      <KnowledgeManager
        // A different draft (another question) remounts the manager with its form open.
        key={draft?.unknownIds.join(",") ?? "none"}
        botId={bot.id}
        defaultLanguage={bot.defaultLanguage}
        faqs={faqs}
        draft={draft}
      />
    </div>
  );
}

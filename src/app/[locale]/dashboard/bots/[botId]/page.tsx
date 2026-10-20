import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { BotEditor } from "@/components/bots/bot-editor";
import { DeleteBot } from "@/components/bots/delete-bot";
import { EmbedSnippet } from "@/components/bots/embed-snippet";
import { LogoSection } from "@/components/bots/logo-section";
import { Link } from "@/i18n/navigation";
import { getBot } from "@/lib/bots/queries";
import { embedSnippet } from "@/lib/bots/snippet";
import { serverEnv } from "@/lib/env.server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/bots/[botId]">): Promise<Metadata> {
  const { botId } = await params;
  const bot = await getBot(botId);
  return { title: bot?.name };
}

export default async function BotPage({ params }: PageProps<"/[locale]/dashboard/bots/[botId]">) {
  const { botId } = await params;
  const [bot, t] = await Promise.all([getBot(botId), getTranslations("Bots.editPage")]);
  if (!bot) notFound();

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href="/dashboard/bots"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("back")}
        </Link>
        <h1 className="font-display text-3xl font-semibold tracking-tight break-words">
          {bot.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("publicKey")}: <code className="font-mono text-foreground">{bot.publicKey}</code>
        </p>
      </div>
      <BotEditor
        bot={bot}
        aside={
          <>
            <EmbedSnippet snippet={embedSnippet(serverEnv().NEXT_PUBLIC_APP_URL, bot.publicKey)} />
            <LogoSection botId={bot.id} botName={bot.name} logoUrl={bot.logoUrl} />
            <DeleteBot botId={bot.id} botName={bot.name} />
          </>
        }
      />
    </div>
  );
}

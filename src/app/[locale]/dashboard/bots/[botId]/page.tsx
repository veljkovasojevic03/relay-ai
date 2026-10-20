import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BotEditor } from "@/components/bots/bot-editor";
import { BotHeader } from "@/components/bots/bot-header";
import { DeleteBot } from "@/components/bots/delete-bot";
import { EmbedSnippet } from "@/components/bots/embed-snippet";
import { LogoSection } from "@/components/bots/logo-section";
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
  const bot = await getBot(botId);
  if (!bot) notFound();

  return (
    <div className="grid gap-6">
      <BotHeader bot={bot} />
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

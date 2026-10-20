import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { Link } from "@/i18n/navigation";
import type { Bot } from "@/lib/bots/queries";

import { BotTabs } from "./bot-tabs";

/** Shared header of every page of one bot: back link, name, public key and section tabs. */
export async function BotHeader({ bot }: { bot: Bot }) {
  const t = await getTranslations("Bots.editPage");
  return (
    <div className="grid min-w-0 gap-4">
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
      {/* Reads the URL, so it sits behind Suspense (Cache Components). */}
      <Suspense fallback={<div className="h-10 border-b" />}>
        <BotTabs botId={bot.id} />
      </Suspense>
    </div>
  );
}

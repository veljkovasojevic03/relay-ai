import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { BotEditor } from "@/components/bots/bot-editor";
import { redirect } from "@/i18n/navigation";
import { asLocale } from "@/i18n/routing";
import { getBotQuota } from "@/lib/bots/queries";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/bots/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Bots.newPage" });
  return { title: t("metaTitle") };
}

export default async function NewBotPage({ params }: PageProps<"/[locale]/dashboard/bots/new">) {
  const [{ locale }, quota, t] = await Promise.all([
    params,
    getBotQuota(),
    getTranslations("Bots.newPage"),
  ]);
  // The list explains the limit; the database refuses the insert regardless.
  if (!quota.canCreate) redirect({ href: "/dashboard/bots", locale: asLocale(locale) });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <BotEditor />
    </div>
  );
}

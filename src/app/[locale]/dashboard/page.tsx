import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArrowRight, BookOpenText, Bot, Code } from "lucide-react";

import { asLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getOwnerProfile } from "@/lib/auth/session";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Dashboard.overview" });
  return { title: t("metaTitle") };
}

export default async function DashboardOverview() {
  const [profile, t] = await Promise.all([
    getOwnerProfile(),
    getTranslations("Dashboard.overview"),
  ]);

  const steps = [
    { icon: Bot, label: t("next.bot") },
    { icon: BookOpenText, label: t("next.faq") },
    { icon: Code, label: t("next.embed") },
  ];

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {profile.displayName
              ? t("greeting", { name: profile.displayName })
              : t("greetingFallback")}
          </h1>
          <p className="text-muted-foreground">{t("lead")}</p>
        </div>
        <p className="rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
          {t("plan")}: {t(`plans.${profile.plan}`)}
        </p>
      </div>

      <section aria-labelledby="next-steps" className="grid gap-3">
        <h2 id="next-steps" className="text-lg font-semibold">
          {t("nextTitle")}
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map(({ icon: Icon, label }, i) => (
            <li key={label} className="grid gap-3 rounded-xl border bg-card p-4">
              <span className="grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="font-medium">
                <span className="sr-only">{i + 1}. </span>
                {label}
              </span>
              <span className="text-sm text-muted-foreground">{t("comingNext")}</span>
            </li>
          ))}
        </ol>
      </section>

      <Link
        href="/dashboard/account"
        className="inline-flex w-fit items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
      >
        {t("accountLink")}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

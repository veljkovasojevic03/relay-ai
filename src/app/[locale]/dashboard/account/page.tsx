import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { asLocale } from "@/i18n/routing";
import { getOwnerProfile, requireUser } from "@/lib/auth/session";

import { AccountForm } from "./account-form";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dashboard/account">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Account" });
  return { title: t("metaTitle") };
}

export default async function AccountPage() {
  const [user, profile, t] = await Promise.all([
    requireUser(),
    getOwnerProfile(),
    getTranslations(),
  ]);

  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t("Account.title")}</h1>
        <p className="text-muted-foreground">{t("Account.subtitle")}</p>
      </div>

      <dl className="grid max-w-lg gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <dt className="text-sm text-muted-foreground">{t("Account.signInEmail")}</dt>
          <dd className="truncate font-medium">
            {user.email ?? (profile.isSandbox ? t("Account.sandboxNoEmail") : "–")}
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-sm text-muted-foreground">{t("Account.plan")}</dt>
          <dd className="font-medium">{t(`Dashboard.overview.plans.${profile.plan}`)}</dd>
        </div>
      </dl>

      <AccountForm profile={profile} />
    </div>
  );
}

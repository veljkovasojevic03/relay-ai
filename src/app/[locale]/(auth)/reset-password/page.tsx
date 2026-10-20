import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { asLocale } from "@/i18n/routing";
import { AuthCard, AuthFormSkeleton } from "@/components/auth/auth-card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";

import { ResetForm } from "./reset-form";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Auth.reset" });
  return { title: t("metaTitle") };
}

export default function ResetPasswordPage() {
  const t = useTranslations("Auth.reset");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <Suspense fallback={<AuthFormSkeleton />}>
        <ResetContent />
      </Suspense>
    </AuthCard>
  );
}

// The recovery link signs the user in via /api/auth/callback; without that session the
// link was used, expired, or opened in another browser.
async function ResetContent() {
  const user = await getCurrentUser();
  if (user) return <ResetForm />;
  return <ExpiredLink />;
}

function ExpiredLink() {
  const t = useTranslations("Auth.reset");
  return (
    <div role="alert" className="grid justify-items-start gap-3">
      <h2 className="font-semibold">{t("expiredTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("expiredBody")}</p>
      <Link href="/forgot-password" className={buttonVariants()}>
        {t("requestNew")}
      </Link>
    </div>
  );
}

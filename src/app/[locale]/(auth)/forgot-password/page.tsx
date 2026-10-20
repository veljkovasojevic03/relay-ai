import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { asLocale } from "@/i18n/routing";
import { AuthCard } from "@/components/auth/auth-card";
import { Link } from "@/i18n/navigation";
import { hasSupabaseAuth } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

import { NotConfigured } from "../not-configured";
import { ForgotForm } from "./forgot-form";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Auth.forgot" });
  return { title: t("metaTitle") };
}

export default function ForgotPasswordPage() {
  const t = useTranslations("Auth.forgot");

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("back")}
        </Link>
      }
    >
      {hasSupabaseAuth(serverEnv()) ? <ForgotForm /> : <NotConfigured />}
    </AuthCard>
  );
}

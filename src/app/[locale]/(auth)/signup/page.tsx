import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { asLocale } from "@/i18n/routing";
import { AuthCard, AuthFormSkeleton } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { OrDivider } from "@/components/auth/or-divider";
import { Link } from "@/i18n/navigation";
import { isGoogleEnabled } from "@/lib/auth/providers";
import { hasSupabaseAuth } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

import { NotConfigured } from "../not-configured";
import { SignupForm } from "./signup-form";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/signup">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Auth.signup" });
  return { title: t("metaTitle") };
}

export default function SignupPage() {
  const t = useTranslations("Auth.signup");

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("loginLink")}
          </Link>
        </>
      }
    >
      <Suspense fallback={<AuthFormSkeleton />}>
        <SignupContent />
      </Suspense>
    </AuthCard>
  );
}

async function SignupContent() {
  if (!hasSupabaseAuth(serverEnv())) return <NotConfigured />;
  const google = await isGoogleEnabled();
  return (
    <div className="grid gap-6">
      {google && (
        <>
          <GoogleButton />
          <OrDivider />
        </>
      )}
      <SignupForm />
    </div>
  );
}

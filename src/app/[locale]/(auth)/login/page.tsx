import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { asLocale } from "@/i18n/routing";
import { AuthCard, AuthFormSkeleton } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { OrDivider } from "@/components/auth/or-divider";
import { Link } from "@/i18n/navigation";
import { isGoogleEnabled } from "@/lib/auth/providers";
import { safeNextPath } from "@/lib/auth/redirects";
import { hasSupabaseAuth } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { ERROR_KEYS, type ErrorKey } from "@/lib/validation/auth";

import { NotConfigured } from "../not-configured";
import { LoginForm } from "./login-form";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Auth.login" });
  return { title: t("metaTitle") };
}

export default function LoginPage({ searchParams }: PageProps<"/[locale]/login">) {
  const t = useTranslations("Auth.login");

  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link
            href="/signup"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("signupLink")}
          </Link>
        </>
      }
    >
      <Suspense fallback={<AuthFormSkeleton />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/[locale]/login">, "searchParams">) {
  if (!hasSupabaseAuth(serverEnv())) return <NotConfigured />;

  const query = await searchParams;
  const next = typeof query.next === "string" ? safeNextPath(query.next) : undefined;
  const error = ERROR_KEYS.find((key) => key === query.error) as ErrorKey | undefined;
  const google = await isGoogleEnabled();

  return (
    <div className="grid gap-6">
      {google && (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      )}
      <LoginForm next={next} initialError={error} />
    </div>
  );
}

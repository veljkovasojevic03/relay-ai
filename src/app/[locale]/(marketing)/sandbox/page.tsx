import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { BarChart3, BookOpenText, Inbox, ShieldCheck } from "lucide-react";
import { Suspense } from "react";

import { Link } from "@/i18n/navigation";
import { asLocale } from "@/i18n/routing";
import { localizedPath } from "@/lib/auth/redirects";
import { hasSupabase, hasSupabaseAuth, hasTurnstile } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";

import { SandboxForm } from "./sandbox-form";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sandbox">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Sandbox" });
  return { title: t("metaTitle"), description: t("lead") };
}

/** "Explore the dashboard": a seeded, temporary workspace without registering (Phase 9). */
export default function SandboxPage() {
  const t = useTranslations("Sandbox");
  const locale = useLocale();
  const env = serverEnv();
  const configured = hasSupabase(env) && hasSupabaseAuth(env);
  const siteKey = hasTurnstile(env) ? env.NEXT_PUBLIC_TURNSTILE_SITE_KEY! : null;

  const inside = [
    { icon: BookOpenText, text: t("inside.bot") },
    { icon: Inbox, text: t("inside.inbox") },
    { icon: BarChart3, text: t("inside.analytics") },
  ];

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-14 sm:px-6 lg:py-20">
      <div className="grid gap-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t("title")}
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">{t("lead")}</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {inside.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-3 rounded-xl border bg-card p-4 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>

      <section
        aria-labelledby="sandbox-start"
        className="grid gap-5 rounded-2xl border bg-card p-5 shadow-card sm:p-6"
      >
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="grid gap-1">
            <h2 id="sandbox-start" className="font-semibold">
              {t("rulesTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("rules")}</p>
          </div>
        </div>
        {configured ? (
          // The form reads `?expired=1` from the URL, which is only known at request time.
          <Suspense fallback={<div className="h-11 w-44 rounded-md bg-muted" aria-hidden="true" />}>
            <SandboxForm siteKey={siteKey} />
          </Suspense>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {t("notConfigured")}
          </p>
        )}
      </section>

      <p className="text-sm text-muted-foreground">
        {t.rich("alternatives", {
          // A full page load, so the demo's widget doesn't follow client navigation back.
          demo: (chunks) => (
            <a
              href={localizedPath(locale, "/demo")}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {chunks}
            </a>
          ),
          signup: (chunks) => (
            <Link
              href="/signup"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
    </main>
  );
}

import { NextIntlClientProvider, useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import { Suspense } from "react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { Wordmark } from "@/components/logo";
import { Link, redirect } from "@/i18n/navigation";
import { getOwnerProfile, requireUser } from "@/lib/auth/session";
import { getInboxCounts } from "@/lib/inbox/queries";

import { DashboardNav } from "./dashboard-nav";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { SandboxBanner } from "./sandbox-banner";
import { UsageBanner } from "./usage-banner";
import { UserMenu } from "./user-menu";

/**
 * The chrome is static and prerendered; everything that reads the session streams in
 * behind Suspense (required with Cache Components, and it keeps navigation instant).
 */
export default function DashboardLayout({ children }: LayoutProps<"/[locale]/dashboard">) {
  const t = useTranslations("Header");

  return (
    // The root layout sends only the public pages' messages to the browser; the dashboard's
    // client components need the whole catalog (inherited automatically in a server layout).
    <NextIntlClientProvider>
      <div className="flex min-h-full flex-1 flex-col">
        <header className="border-b bg-card">
          <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
            <Link href="/dashboard" aria-label={t("dashboard")} className="rounded-md">
              <Wordmark />
            </Link>
            <div className="ml-auto flex items-center gap-3">
              {/* Both read the URL, which dynamic segments (bots/[botId]) only know at request time. */}
              <Suspense
                fallback={<div className="h-10 w-28 rounded-full bg-muted" aria-hidden="true" />}
              >
                <LocaleSwitcher />
              </Suspense>
              <Suspense
                fallback={<div className="h-8 w-24 rounded-md bg-muted" aria-hidden="true" />}
              >
                <UserMenu />
              </Suspense>
            </div>
          </div>
        </header>
        <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 lg:py-10">
          <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <Suspense
              fallback={<div className="h-10 rounded-md bg-muted lg:h-32" aria-hidden="true" />}
            >
              <NavWithCounts />
            </Suspense>
          </aside>
          <main className="min-w-0">
            <Suspense fallback={null}>
              <SandboxBanner />
            </Suspense>
            <Suspense fallback={null}>
              <UsageBanner />
            </Suspense>
            <Suspense fallback={<DashboardSkeleton />}>
              <AuthGate>{children}</AuthGate>
            </Suspense>
          </main>
        </div>
      </div>
    </NextIntlClientProvider>
  );
}

// Defense in depth: the proxy already redirects signed-out visitors, but rendering never
// depends on it.
// An expired sandbox ends here even before the cron tick deletes it.
async function AuthGate({ children }: { children: React.ReactNode }) {
  await requireUser();
  const profile = await getOwnerProfile();
  if (
    profile.isSandbox &&
    profile.sandboxExpiresAt &&
    new Date(profile.sandboxExpiresAt).getTime() < Date.now()
  ) {
    return redirect({
      href: { pathname: "/sandbox", query: { expired: "1" } },
      locale: await getLocale(),
    });
  }
  return children;
}

/** The nav with the inbox's unread count (read with the owner's session, so dynamic). */
async function NavWithCounts() {
  const { unread } = await getInboxCounts();
  return <DashboardNav unread={unread} />;
}

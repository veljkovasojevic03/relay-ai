import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { Wordmark } from "@/components/logo";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/session";

import { DashboardNav } from "./dashboard-nav";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { UserMenu } from "./user-menu";

/**
 * The chrome is static and prerendered; everything that reads the session streams in
 * behind Suspense (required with Cache Components, and it keeps navigation instant).
 */
export default function DashboardLayout({ children }: LayoutProps<"/[locale]/dashboard">) {
  const t = useTranslations("Header");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/dashboard" aria-label={t("dashboard")} className="rounded-md">
            <Wordmark />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <LocaleSwitcher />
            <Suspense
              fallback={<div className="h-8 w-24 rounded-md bg-muted" aria-hidden="true" />}
            >
              <UserMenu />
            </Suspense>
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-2 sm:px-4">
          <DashboardNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <Suspense fallback={<DashboardSkeleton />}>
          <AuthGate>{children}</AuthGate>
        </Suspense>
      </main>
    </div>
  );
}

// Defense in depth: the proxy already redirects signed-out visitors, but rendering never
// depends on it.
async function AuthGate({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}

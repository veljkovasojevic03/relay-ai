import { useLocale, useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { localizedPath } from "@/lib/auth/redirects";

import { LocaleSwitcher } from "./locale-switcher";
import { Wordmark } from "./logo";

/** Public header. `minimal` hides the sign-in link (used on the auth pages themselves). */
export function SiteHeader({ minimal = false }: { minimal?: boolean }) {
  const t = useTranslations("Header");
  const locale = useLocale();

  return (
    <header className="border-b bg-background/90">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link prefetch={false} href="/" aria-label={t("home")} className="rounded-md">
          <Wordmark />
        </Link>
        {!minimal && (
          <nav
            aria-label={t("nav")}
            className="hidden items-center gap-5 text-sm font-medium md:flex"
          >
            {/* A full page load: the demo's widget must not follow client navigation. */}
            <a href={localizedPath(locale, "/demo")} className="hover:text-primary">
              {t("demo")}
            </a>
            <Link
              prefetch={false}
              href={{ pathname: "/", hash: "pricing" }}
              className="hover:text-primary"
            >
              {t("pricing")}
            </Link>
          </nav>
        )}
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          {!minimal && (
            <>
              <Link
                prefetch={false}
                href="/login"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                {t("signIn")}
              </Link>
              <Link
                prefetch={false}
                href="/signup"
                className={buttonVariants({ size: "sm", className: "max-sm:hidden" })}
              >
                {t("signUp")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

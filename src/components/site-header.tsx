import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

import { LocaleSwitcher } from "./locale-switcher";
import { Wordmark } from "./logo";

/** Public header. `minimal` hides the sign-in link (used on the auth pages themselves). */
export function SiteHeader({ minimal = false }: { minimal?: boolean }) {
  const t = useTranslations("Header");

  return (
    <header className="border-b bg-background/90">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label={t("home")} className="rounded-md">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          {!minimal && (
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("signIn")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

import { LocaleSwitcher } from "./locale-switcher";
import { Wordmark } from "./logo";

export function SiteHeader() {
  const t = useTranslations("Header");

  return (
    <header className="border-b bg-background/90">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label={t("home")} className="rounded-md">
          <Wordmark />
        </Link>
        <LocaleSwitcher />
      </div>
    </header>
  );
}

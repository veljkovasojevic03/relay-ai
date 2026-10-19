import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-24 sm:px-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body")}</p>
      <Button asChild>
        <Link href="/">{t("back")}</Link>
      </Button>
    </main>
  );
}

import { useTranslations } from "next-intl";

export function SiteFooter() {
  const t = useTranslations("Footer");

  return (
    <footer className="border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
        {t("note")}
      </div>
    </footer>
  );
}

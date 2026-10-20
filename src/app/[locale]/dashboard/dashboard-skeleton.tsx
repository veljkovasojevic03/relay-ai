import { useTranslations } from "next-intl";

export function DashboardSkeleton() {
  const t = useTranslations("Dashboard");
  return (
    <div role="status" className="grid gap-6">
      <span className="sr-only">{t("loading")}</span>
      <div className="h-9 w-64 rounded-md bg-muted" aria-hidden="true" />
      <div className="h-5 w-80 max-w-full rounded bg-muted" aria-hidden="true" />
      <div className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}

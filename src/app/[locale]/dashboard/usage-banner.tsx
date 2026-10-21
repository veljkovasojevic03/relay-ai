import { Gauge } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getUsage, periodResetsAt, usageShare } from "@/lib/billing/usage";
import { cn } from "@/lib/utils";

/**
 * Warns at 80% of the month's conversations and says plainly when the limit is reached:
 * visitors then see "chat unavailable" until the counter resets (spec §4.9).
 */
export async function UsageBanner() {
  if (!(await getCurrentUser())) return null;
  const usage = await getUsage();
  const share = usageShare(usage);
  if (share < 0.8) return null;
  const [t, format] = await Promise.all([getTranslations("Billing.banner"), getFormatter()]);
  const reached = share >= 1;
  const values = {
    used: usage.conversations,
    limit: usage.conversationLimit,
    date: format.dateTime(periodResetsAt(usage.period), { dateStyle: "long" }),
  };

  return (
    <section
      aria-label={t("label")}
      role={reached ? "alert" : undefined}
      className={cn(
        "mb-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center",
        reached
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-accent-strong/50 bg-accent text-accent-foreground",
      )}
    >
      <Gauge className="size-5 shrink-0" aria-hidden="true" />
      <p className="text-sm text-pretty">{reached ? t("reached", values) : t("near", values)}</p>
      {usage.plan === "free" && (
        <Link
          href="/dashboard/billing"
          className="text-sm font-semibold underline-offset-4 hover:underline sm:ml-auto"
        >
          {t("upgrade")}
        </Link>
      )}
    </section>
  );
}

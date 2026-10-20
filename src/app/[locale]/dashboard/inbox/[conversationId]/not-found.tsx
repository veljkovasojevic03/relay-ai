import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// Also covers chats of other owners: RLS makes them invisible.
export default function ConversationNotFound() {
  const t = useTranslations();
  return (
    <div className="grid max-w-lg justify-items-start gap-3 rounded-xl border bg-card p-6">
      <h1 className="font-display text-2xl font-semibold">{t("Errors.notFound")}</h1>
      <Link href="/dashboard/inbox" className={buttonVariants({ variant: "outline" })}>
        {t("Inbox.back")}
      </Link>
    </div>
  );
}

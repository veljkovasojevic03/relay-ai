import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { ConversationStatus } from "@/lib/inbox/queries";
import { cn } from "@/lib/utils";

const STYLE: Record<ConversationStatus, string> = {
  waiting_human: "border-primary bg-accent text-accent-foreground",
  human: "border-success/40 text-success",
  bot: "border-border text-muted-foreground",
  resolved: "border-border bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: ConversationStatus }) {
  const t = useTranslations("Inbox.status");
  return (
    <Badge variant="outline" className={cn(STYLE[status])}>
      {t(status)}
    </Badge>
  );
}

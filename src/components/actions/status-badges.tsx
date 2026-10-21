import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { ActionRun, EventStatus } from "@/lib/actions/queries";
import { cn } from "@/lib/utils";

const RUN_STYLE: Record<ActionRun["status"], string> = {
  pending_confirmation: "border-border text-muted-foreground",
  confirmed: "border-primary text-foreground",
  running: "border-primary text-foreground",
  succeeded: "border-success/40 text-success",
  failed: "border-destructive/50 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground",
};

export function RunStatusBadge({ status }: { status: ActionRun["status"] }) {
  const t = useTranslations("Actions.runStatus");
  return (
    <Badge variant="outline" className={cn(RUN_STYLE[status])}>
      {t(status)}
    </Badge>
  );
}

const EVENT_STYLE: Record<EventStatus, string> = {
  pending: "border-primary bg-accent text-accent-foreground",
  delivered: "border-primary text-foreground",
  sent: "border-success/40 text-success",
  failed: "border-destructive/50 text-destructive",
  simulated: "border-border bg-muted text-muted-foreground",
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const t = useTranslations("Events.status");
  return (
    <Badge variant="outline" className={cn(EVENT_STYLE[status])}>
      {t(status)}
    </Badge>
  );
}

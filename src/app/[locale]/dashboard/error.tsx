"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

// Error boundary for the dashboard. The error itself is logged on the server; nothing about
// it is shown to the owner beyond a friendly message.
export default function DashboardError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("Dashboard.error");

  return (
    <div
      role="alert"
      className="grid max-w-lg justify-items-start gap-3 rounded-xl border bg-card p-6"
    >
      <CircleAlert className="size-6 text-destructive" aria-hidden="true" />
      <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body")}</p>
      <Button onClick={() => retry()}>{t("retry")}</Button>
    </div>
  );
}

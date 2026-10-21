"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// Error boundary for the public pages (landing, demo, sandbox, sign-in). The dashboard has
// its own inside its layout. The error is logged on the server; visitors see only this.
export default function PageError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("PageError");

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-24 sm:px-6"
    >
      <div role="alert" className="grid justify-items-start gap-3">
        <CircleAlert className="size-6 text-destructive" aria-hidden="true" />
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("body")}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => retry()}>{t("retry")}</Button>
        <Button variant="outline" asChild>
          <Link prefetch={false} href="/">
            {t("back")}
          </Link>
        </Button>
      </div>
    </main>
  );
}

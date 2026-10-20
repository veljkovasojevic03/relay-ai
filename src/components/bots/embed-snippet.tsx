"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function EmbedSnippet({ snippet }: { snippet: string }) {
  const t = useTranslations("Bots.embed");
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("failed");
    }
  }

  return (
    <section aria-labelledby="embed-title" className="grid gap-3 rounded-xl border bg-card p-5">
      <h2 id="embed-title" className="font-semibold">
        {t("title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      <pre className="rounded-lg bg-foreground p-3 text-xs leading-relaxed break-all whitespace-pre-wrap text-background">
        <code data-testid="embed-snippet">{snippet}</code>
      </pre>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={copy}>
          {status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {t("copy")}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {status === "copied" ? t("copied") : status === "failed" ? t("copyFailed") : ""}
        </span>
      </div>
    </section>
  );
}

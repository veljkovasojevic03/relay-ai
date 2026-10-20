"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import type { FeaturedQuestion, Language } from "@/lib/bots/schema";
import { cn } from "@/lib/utils";

export type PreviewSettings = {
  name: string;
  brandColor: string;
  logoUrl: string | null;
  greeting: Partial<Record<Language, string>>;
  position: "left" | "right";
  questions: FeaturedQuestion[];
  defaultLanguage: Language;
};

// The shape window.RelayAI.preview() expects (widget/src/index.ts).
type WidgetPreviewSettings = Omit<PreviewSettings, "defaultLanguage"> & {
  defaultLanguage: Language;
  lang: Language;
};
type PreviewHandle = { update: (s: WidgetPreviewSettings) => void; destroy: () => void };
type RelayGlobal = {
  preview: (container: HTMLElement, settings: WidgetPreviewSettings) => PreviewHandle;
};

let loader: Promise<RelayGlobal> | null = null;

/** Loads the real widget bundle once per page; it registers window.RelayAI. */
function loadWidget(): Promise<RelayGlobal> {
  const existing = (window as { RelayAI?: RelayGlobal }).RelayAI;
  if (existing) return Promise.resolve(existing);
  loader ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/widget.js";
    script.async = true;
    script.onload = () => {
      const relay = (window as { RelayAI?: RelayGlobal }).RelayAI;
      if (relay) resolve(relay);
      else reject(new Error("widget did not register"));
    };
    script.onerror = () => {
      loader = null;
      reject(new Error("widget failed to load"));
    };
    document.head.appendChild(script);
  });
  return loader;
}

/**
 * The real widget (public/widget.js) rendering the draft settings in its own Shadow DOM, so
 * what the owner sees is exactly what visitors get. Preview mode never sends messages.
 */
export function WidgetPreview({ settings }: { settings: PreviewSettings }) {
  const t = useTranslations("Bots.preview");
  const tLocale = useTranslations("Locale");
  const tHeader = useTranslations("Header");
  const [chosen, setLanguage] = useState<Language | null>(null);
  const [failed, setFailed] = useState(false);
  const language = chosen ?? settings.defaultLanguage;
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<PreviewHandle | null>(null);
  const latest = useRef<WidgetPreviewSettings | null>(null);

  const draft = useMemo<WidgetPreviewSettings>(
    () => ({ ...settings, lang: language }),
    [settings, language],
  );

  // Declared before the mount effect, so the first mount already sees the draft.
  useEffect(() => {
    latest.current = draft;
    handle.current?.update(draft);
  }, [draft]);

  useEffect(() => {
    let cancelled = false;
    loadWidget()
      .then((relay) => {
        if (cancelled || !container.current || !latest.current) return;
        handle.current = relay.preview(container.current, latest.current);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
    };
  }, []);

  return (
    <section aria-labelledby="preview-title" className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="preview-title" className="font-semibold">
          {t("title")}
        </h2>
        <div
          role="group"
          aria-label={tHeader("language")}
          className="flex gap-1 rounded-full border bg-card p-1 text-xs"
        >
          {(["en", "sr"] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              aria-pressed={language === lang}
              onClick={() => setLanguage(lang)}
              className={cn(
                "rounded-full px-2.5 py-1 font-medium",
                language === lang ? "bg-foreground text-background" : "text-muted-foreground",
              )}
            >
              {tLocale(lang)}
            </button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "grid min-h-[200px] grid-cols-[minmax(0,1fr)] rounded-2xl border bg-[repeating-linear-gradient(135deg,var(--muted)_0_12px,var(--background)_12px_24px)] p-4",
          settings.position === "left" ? "justify-items-start" : "justify-items-end",
        )}
      >
        {failed ? (
          <p role="alert" className="self-center text-sm text-destructive">
            {t("failed")}
          </p>
        ) : (
          <div
            ref={container}
            data-testid="widget-preview"
            className="w-full max-w-[380px] min-w-0"
          />
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("note")}</p>
    </section>
  );
}

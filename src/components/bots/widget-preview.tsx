"use client";

import { MessageCircle, SendHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { FeaturedQuestion, Language } from "@/lib/bots/schema";
import { readableForeground } from "@/lib/design/contrast";
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

const FALLBACK_GREETING: Record<Language, string> = {
  en: "Hi! How can I help you today?",
  sr: "Zdravo! Kako mogu da pomognem?",
};

/**
 * Static mock of the widget built from the draft settings (Phase 5 swaps in the real one).
 * The mock is `inert`: it looks interactive but takes no focus or clicks.
 */
export function WidgetPreview({ settings }: { settings: PreviewSettings }) {
  const t = useTranslations("Bots.preview");
  const tLocale = useTranslations("Locale");
  const tHeader = useTranslations("Header");
  // Follows the bot's default language until the owner picks one in the preview.
  const [chosen, setLanguage] = useState<Language | null>(null);
  const language = chosen ?? settings.defaultLanguage;
  const color = /^#[0-9a-f]{6}$/i.test(settings.brandColor) ? settings.brandColor : "#b3472b";
  const fg = readableForeground(color).color;
  const greeting = settings.greeting[language] || FALLBACK_GREETING[language];
  const chips = settings.questions.filter((q) => q.language === language);
  const name = settings.name.trim() || "Relay";

  return (
    <section aria-labelledby="preview-title" className="grid gap-3">
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
        inert
        lang={language}
        className="relative grid gap-3 rounded-2xl border bg-[repeating-linear-gradient(135deg,var(--muted)_0_12px,var(--background)_12px_24px)] p-4"
      >
        <div
          className={cn(
            "w-full max-w-[320px] overflow-hidden rounded-2xl border bg-white text-[#1f1a17] shadow-card",
            settings.position === "left" ? "justify-self-start" : "justify-self-end",
          )}
        >
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ background: color, color: fg }}
          >
            {settings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user logo from Supabase Storage
              <img
                src={settings.logoUrl}
                alt=""
                className="size-9 rounded-full bg-white object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-full text-sm font-semibold"
                style={{ background: fg, color }}
              >
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold">{name}</p>
              <p className="text-xs opacity-85">{t("subtitle")}</p>
            </div>
          </div>
          <div className="grid gap-3 p-4 text-sm">
            <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-[#f3ece3] px-3 py-2">
              {greeting}
            </p>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {chips.map((q, i) => (
                  <span
                    key={i}
                    className="rounded-full border px-3 py-1 text-xs font-medium"
                    style={{ borderColor: color, color: "#1f1a17" }}
                  >
                    {q.text}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t px-3 py-2">
            <span className="flex-1 truncate text-sm text-[#6b5d52]">{t("inputPlaceholder")}</span>
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-full"
              style={{ background: color, color: fg }}
            >
              <SendHorizontal className="size-4" />
            </span>
          </div>
        </div>
        <span
          aria-hidden="true"
          className={cn(
            "grid size-12 place-items-center rounded-full shadow-card",
            settings.position === "left" ? "justify-self-start" : "justify-self-end",
          )}
          style={{ background: color, color: fg }}
        >
          <MessageCircle className="size-5" />
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{t("note")}</p>
    </section>
  );
}

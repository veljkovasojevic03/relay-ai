import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { getTranslations } from "next-intl/server";
import { ImageResponse } from "next/og";

import { asLocale } from "@/i18n/routing";

// The link preview for every page (spec Phase 12). Prerendered once per locale.
export const alt = "Relay AI";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fonts = join(process.cwd(), "src/assets/fonts");

export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const [t, display, sans] = await Promise.all([
    getTranslations({ locale, namespace: "Home" }),
    readFile(join(fonts, "Fraunces-SemiBold.ttf")),
    readFile(join(fonts, "InstrumentSans-Medium.ttf")),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#fbf7f2",
        color: "#1f1a17",
        padding: 72,
        fontFamily: "Instrument Sans",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
            <path
              d="M4 7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-7l-4 3.5V16a3 3 0 0 1-3-3V7Z"
              fill="#b3472b"
            />
            <path
              d="M28 15a3 3 0 0 0-3-3h-2v1a5 5 0 0 1-5 5h-6v1a3 3 0 0 0 3 3h6l4 3.5V22a3 3 0 0 0 3-3v-4Z"
              fill="#e0913f"
            />
            <path
              d="M9 10h7m0 0-2.5-2.5M16 10l-2.5 2.5"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ fontFamily: "Fraunces", fontSize: 44 }}>Relay</span>
          <span
            style={{
              background: "#b3472b",
              color: "#fff",
              fontSize: 24,
              padding: "4px 10px",
              borderRadius: 8,
            }}
          >
            AI
          </span>
        </div>
        <div style={{ fontFamily: "Fraunces", fontSize: 76, lineHeight: 1.05, maxWidth: 640 }}>
          {t("hero.title")}
        </div>
        <div style={{ fontSize: 30, color: "#6b5d52", maxWidth: 620, lineHeight: 1.35 }}>
          {t("hero.eyebrow")}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 18,
          width: 380,
          fontSize: 24,
        }}
      >
        <div
          style={{
            alignSelf: "flex-end",
            background: "#1f1a17",
            color: "#fbf7f2",
            padding: "14px 20px",
            borderRadius: "22px 22px 6px 22px",
          }}
        >
          {t("steps.handoff.question")}
        </div>
        <div
          style={{
            background: "#f3ece3",
            padding: "14px 20px",
            borderRadius: "22px 22px 22px 6px",
            lineHeight: 1.35,
          }}
        >
          {t("steps.handoff.reply")}
        </div>
        <div
          style={{
            alignSelf: "flex-start",
            border: "2px solid #b3472b",
            color: "#b3472b",
            padding: "8px 18px",
            borderRadius: 999,
          }}
        >
          {`${t("steps.handoff.you")} →`}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Fraunces", data: display, weight: 600, style: "normal" },
        { name: "Instrument Sans", data: sans, weight: 500, style: "normal" },
      ],
    },
  );
}

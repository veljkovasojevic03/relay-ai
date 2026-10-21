import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Fraunces, Instrument_Sans } from "next/font/google";
import { notFound } from "next/navigation";

import { PUBLIC_CLIENT_MESSAGES, pickMessages } from "@/i18n/client-messages";
import { routing } from "@/i18n/routing";
import { serverEnv } from "@/lib/env.server";

import "../globals.css";

// One static weight: every heading is semibold, and the variable font with its SOFT/opsz axes
// cost ~220 KB of preloaded font on every page (Lighthouse mobile LCP, Phase 12).
// `subsets` only picks what is preloaded: the latin-ext faces (č, ć, š, ž, đ) are still
// declared and load on demand on Serbian pages.
const display = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: "600",
});

const sans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    // Absolute URLs for the Open Graph image and links (spec Phase 12).
    metadataBase: new URL(serverEnv().NEXT_PUBLIC_APP_URL),
    title: { default: t("title"), template: `%s · ${t("title")}` },
    description: t("description"),
    openGraph: {
      type: "website",
      siteName: "Relay AI",
      locale: locale === "sr" ? "sr_RS" : "en_US",
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Header" });

  return (
    <html lang={locale} className={`${display.variable} ${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* Every page's <main> has id="main" and tabIndex={-1}, so focus moves there too. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider
          messages={pickMessages(await getMessages(), PUBLIC_CLIENT_MESSAGES)}
        >
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

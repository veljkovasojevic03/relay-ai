import type { Metadata } from "next";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Bodoni_Moda, Manrope } from "next/font/google";
import Script from "next/script";
import { ArrowLeft, MapPin, RotateCcw, Truck, Wallet } from "lucide-react";

import { localizedPath } from "@/lib/auth/redirects";
import { DEMO_BOT_PUBLIC_KEY } from "@/lib/demo/kroj";
import { asLocale, routing } from "@/i18n/routing";

import { Garment, type GarmentKind } from "./garment";
import { TryThese } from "./try-these";

// Kroj is a different (fictional) company with its own look, so it reads as a third-party
// site that embeds Relay, not as part of Relay (spec §9).
const serif = Bodoni_Moda({ subsets: ["latin", "latin-ext"], variable: "--font-kroj-serif" });
const sans = Manrope({ subsets: ["latin", "latin-ext"], variable: "--font-kroj-sans" });

export async function generateMetadata({ params }: PageProps<"/[locale]/demo">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: asLocale(locale), namespace: "Demo" });
  return {
    title: { absolute: t("metaTitle") },
    description: t("metaDescription"),
  };
}

type Product = {
  name: string;
  category: "shoes" | "women" | "men" | "accessories";
  price: number;
  kind: GarmentKind;
  tint: string;
  ink: string;
};

// Names match the items in the seeded demo orders.
const PRODUCTS: Product[] = [
  {
    name: "Patike Trk",
    category: "shoes",
    price: 8990,
    kind: "sneaker",
    tint: "#e7ece9",
    ink: "#1f3d36",
  },
  {
    name: "Lanena košulja",
    category: "men",
    price: 5490,
    kind: "shirt",
    tint: "#efe9df",
    ink: "#6b5332",
  },
  {
    name: "Haljina Leto",
    category: "women",
    price: 6990,
    kind: "dress",
    tint: "#f3e4df",
    ink: "#8a3b2a",
  },
  {
    name: "Jakna Vetar",
    category: "men",
    price: 12490,
    kind: "jacket",
    tint: "#e3e7ee",
    ink: "#2c3e5c",
  },
  {
    name: "Džemper Vuna",
    category: "women",
    price: 7990,
    kind: "sweater",
    tint: "#ece6f0",
    ink: "#4f3d66",
  },
  {
    name: "Farmerke Ravne",
    category: "men",
    price: 6490,
    kind: "jeans",
    tint: "#e2e8ef",
    ink: "#2b4a6e",
  },
  {
    name: "Sandale Plaža",
    category: "shoes",
    price: 4990,
    kind: "sandal",
    tint: "#f4ead9",
    ink: "#7a5418",
  },
  {
    name: "Mokasine Kalemegdan",
    category: "shoes",
    price: 10990,
    kind: "loafer",
    tint: "#ece4dc",
    ink: "#5a3a26",
  },
];

export default function DemoStorePage() {
  const t = useTranslations("Demo");
  const locale = useLocale();
  const price = new Intl.NumberFormat(locale === "sr" ? "sr-Latn-RS" : "en-GB");

  return (
    <div
      className={`${serif.variable} ${sans.variable} flex min-h-full flex-1 flex-col bg-[#f7f5f1] font-[family-name:var(--font-kroj-sans)] text-[#171717]`}
    >
      {/* Honest framing: this strip belongs to Relay, the rest of the page to "Kroj". */}
      <div className="bg-[#171717] text-[13px] text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-6">
          <p>{t("bar.text")}</p>
          {/* Full page loads: the widget must not stay mounted on Relay's own pages. */}
          <a
            href={localizedPath(asLocale(locale), "/")}
            className="ml-auto flex items-center gap-1 font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {t("bar.back")}
          </a>
        </div>
      </div>

      <div className="flex-1 lg:grid lg:grid-cols-[21rem_minmax(0,1fr)]">
        <TryThese />
        <div className="flex min-w-0 flex-col">
          <header className="border-b border-[#e5e2dc] bg-[#f7f5f1]">
            <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
              <a
                href="#main"
                className="font-[family-name:var(--font-kroj-serif)] text-3xl font-semibold tracking-[0.18em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1f3d36]"
              >
                KROJ
              </a>
              <nav aria-label={t("nav.label")} className="hidden gap-6 text-sm font-medium md:flex">
                <a href="#products" className="hover:underline">
                  {t("nav.new")}
                </a>
                <a href="#store" className="hover:underline">
                  {t("nav.store")}
                </a>
                <a href="#help" className="hover:underline">
                  {t("nav.help")}
                </a>
              </nav>
              <nav aria-label={t("nav.language")} className="ml-auto flex gap-1 text-xs font-bold">
                {routing.locales.map((l) => (
                  <a
                    key={l}
                    href={localizedPath(l, "/demo")}
                    hrefLang={l}
                    aria-current={l === locale ? "true" : undefined}
                    className="rounded px-2 py-1 uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f3d36] aria-[current]:bg-[#171717] aria-[current]:text-white"
                  >
                    {l}
                  </a>
                ))}
              </nav>
            </div>
          </header>

          <main id="main" tabIndex={-1} className="flex-1">
            <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-20">
              <div className="grid gap-6">
                <p className="text-xs font-bold tracking-[0.25em] text-[#1f3d36] uppercase">
                  {t("hero.eyebrow")}
                </p>
                <h1 className="font-[family-name:var(--font-kroj-serif)] text-5xl leading-[1.02] text-balance sm:text-6xl">
                  {t("hero.title")}
                </h1>
                <p className="max-w-md text-lg text-[#404040]">{t("hero.lead")}</p>
                <a
                  href="#products"
                  className="w-fit bg-[#1f3d36] px-6 py-3 text-sm font-bold tracking-wide text-white uppercase hover:bg-[#16302a] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1f3d36]"
                >
                  {t("hero.cta")}
                </a>
              </div>
              <div className="grid grid-cols-2 gap-3" aria-hidden="true">
                <div className="row-span-2 grid place-items-center bg-[#dfe6e2] p-6 text-[#1f3d36]">
                  <Garment kind="jacket" className="w-full max-w-56" />
                </div>
                <div className="grid place-items-center bg-[#efe3d6] p-6 text-[#7a5418]">
                  <Garment kind="sneaker" className="w-full max-w-36" />
                </div>
                <div className="grid place-items-center bg-[#e8e2ec] p-6 text-[#4f3d66]">
                  <Garment kind="scarf" className="w-full max-w-28" />
                </div>
              </div>
            </section>

            <section aria-label={t("perks.label")} className="border-y border-[#e5e2dc] bg-white">
              <ul className="mx-auto grid max-w-6xl gap-4 px-4 py-5 text-sm sm:grid-cols-3 sm:px-6">
                {[
                  { icon: Truck, text: t("perks.shipping") },
                  { icon: RotateCcw, text: t("perks.returns") },
                  { icon: Wallet, text: t("perks.payment") },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-3">
                    <Icon className="size-5 shrink-0 text-[#1f3d36]" aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>
            </section>

            <section
              id="products"
              aria-labelledby="products-title"
              className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6"
            >
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2
                  id="products-title"
                  className="font-[family-name:var(--font-kroj-serif)] text-4xl"
                >
                  {t("products.title")}
                </h2>
                <p className="text-sm text-[#525252]">{t("products.note")}</p>
              </div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
                {PRODUCTS.map((p) => (
                  <li key={p.name} className="grid gap-3">
                    <div
                      className="grid aspect-[4/5] place-items-center p-6"
                      style={{ backgroundColor: p.tint, color: p.ink }}
                    >
                      <Garment kind={p.kind} className="w-4/5" />
                    </div>
                    <div className="grid gap-0.5">
                      <p className="text-xs tracking-wide text-[#525252] uppercase">
                        {t(`products.category.${p.category}`)}
                      </p>
                      <h3 className="font-semibold">{p.name}</h3>
                      <p className="text-sm">{price.format(p.price)} RSD</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section id="store" aria-labelledby="store-title" className="bg-[#1f3d36] text-white">
              <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-2">
                <h2 id="store-title" className="font-[family-name:var(--font-kroj-serif)] text-4xl">
                  {t("store.title")}
                </h2>
                <div className="grid gap-3 text-[#e6efec]">
                  <p>{t("store.text")}</p>
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {t("store.address")}
                  </p>
                </div>
              </div>
            </section>

            <section
              id="help"
              aria-labelledby="help-title"
              className="mx-auto max-w-6xl px-4 py-14 sm:px-6"
            >
              <h2 id="help-title" className="font-[family-name:var(--font-kroj-serif)] text-3xl">
                {t("help.title")}
              </h2>
              <p className="mt-3 max-w-2xl text-[#404040]">{t("help.text")}</p>
            </section>
          </main>

          <footer className="border-t border-[#e5e2dc] bg-white text-sm text-[#404040]">
            <div className="mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-2 px-4 py-8 pb-24 sm:px-6">
              <p className="font-[family-name:var(--font-kroj-serif)] text-lg font-semibold tracking-[0.18em] text-[#171717]">
                KROJ
              </p>
              <p>{t("footer.contact")}</p>
              <p className="md:ml-auto">{t("footer.fictional")}</p>
            </div>
          </footer>
        </div>
      </div>

      {/* The real embed: the same one line a shop owner pastes (spec §4.10). */}
      <Script
        src="/widget.js"
        data-bot={DEMO_BOT_PUBLIC_KEY}
        data-lang={locale}
        strategy="afterInteractive"
      />
    </div>
  );
}

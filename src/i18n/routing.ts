import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "sr"],
  defaultLocale: "en",
  // English lives at `/`, Serbian at `/sr`. Keeps `/demo` a clean URL for the default locale.
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

/** Narrows a route param to a supported locale (the default when it isn't one). */
export function asLocale(value: string | undefined): Locale {
  return routing.locales.find((l) => l === value) ?? routing.defaultLocale;
}

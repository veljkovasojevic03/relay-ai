import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "sr"],
  defaultLocale: "en",
  // English lives at `/`, Serbian at `/sr`. Keeps `/demo` a clean URL for the default locale.
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

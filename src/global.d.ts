import type messages from "../messages/en.json";
import type { Locale } from "./i18n/routing";

// English is the reference catalog; a parity test keeps sr.json in sync with it.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}

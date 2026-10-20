import "server-only";

import { hasLocale } from "next-intl";

import { routing, type Locale } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The `locale` hidden field of a dashboard form (root params aren't available in actions). */
export function localeOf(values: Record<string, string>): Locale {
  return hasLocale(routing.locales, values.locale) ? values.locale : routing.defaultLocale;
}

/** Authorizes the request and returns a client acting as the owner (RLS applies). */
export async function ownerClient(locale: Locale) {
  await requireUser(locale);
  return (await createSupabaseServerClient())!;
}

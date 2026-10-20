import "server-only";

import { cacheLife } from "next/cache";

import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";

/**
 * Asks Supabase Auth which external providers are enabled, so the Google button only shows
 * when it will work (a disabled provider would otherwise end on a raw JSON error page).
 */
export async function isGoogleEnabled(): Promise<boolean> {
  "use cache";
  cacheLife("minutes");

  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } = serverEnv();
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return settings.external?.google === true;
  } catch {
    log.warn("auth.settings_unavailable");
    return false;
  }
}

import { routing, type Locale } from "@/i18n/routing";

/** Paths (without locale prefix) that need a signed-in owner. */
export const PROTECTED_PREFIXES = ["/dashboard"] as const;
/** Auth pages a signed-in owner is bounced away from. Reset is excluded on purpose. */
export const GUEST_ONLY_PATHS = ["/login", "/signup", "/forgot-password"] as const;

export const DEFAULT_AFTER_LOGIN = "/dashboard";

/** Splits `/sr/dashboard/account` into `{ locale: "sr", path: "/dashboard/account" }`. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const [, first, ...rest] = pathname.split("/");
  const match = routing.locales.find((l) => l === first);
  if (match) return { locale: match, path: `/${rest.join("/")}`.replace(/\/$/, "") || "/" };
  return { locale: routing.defaultLocale, path: pathname || "/" };
}

const startsWithSegment = (path: string, prefix: string) =>
  path === prefix || path.startsWith(`${prefix}/`);

export const isProtectedPath = (path: string) =>
  PROTECTED_PREFIXES.some((p) => startsWithSegment(path, p));

export const isGuestOnlyPath = (path: string) => GUEST_ONLY_PATHS.some((p) => path === p);

/**
 * Accepts only same-origin relative paths for post-login redirects (open-redirect guard).
 * Returns the path without a locale prefix, or the fallback.
 */
export function safeNextPath(next: unknown, fallback = DEFAULT_AFTER_LOGIN): string {
  return safeNext(next, fallback).path;
}

/** Like `safeNextPath`, but also returns the locale prefix of a valid `next`. */
export function safeNext(
  next: unknown,
  fallback = DEFAULT_AFTER_LOGIN,
): { locale: Locale; path: string } {
  const rejected = { locale: routing.defaultLocale, path: fallback };
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return rejected;
  // Must be a single leading slash: rejects "//evil.com", "/\evil.com", "https://..".
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return rejected;
  // Control characters and backslashes can be normalized into a different origin by browsers.
  if (/[\u0000-\u001f\\]/.test(next)) return rejected;
  try {
    const url = new URL(next, "https://relay.invalid");
    if (url.origin !== "https://relay.invalid") return rejected;
    const { locale, path } = splitLocale(url.pathname);
    return { locale, path: path + url.search };
  } catch {
    return rejected;
  }
}

/** Builds a locale-prefixed path the way next-intl's `as-needed` routing expects. */
export function localizedPath(locale: Locale, path: string): string {
  return locale === routing.defaultLocale ? path : `/${locale}${path === "/" ? "" : path}`;
}

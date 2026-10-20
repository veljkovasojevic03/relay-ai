import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import {
  DEFAULT_AFTER_LOGIN,
  isGuestOnlyPath,
  isProtectedPath,
  localizedPath,
  splitLocale,
} from "./lib/auth/redirects";
import { refreshSession } from "./lib/supabase/proxy";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/** Redirect that keeps any auth cookies the session refresh just rotated. */
function redirectKeepingCookies(url: URL, from: NextResponse) {
  const response = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) response.cookies.set(cookie);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export default async function proxy(request: NextRequest) {
  const response = intl(request);
  const { locale, path } = splitLocale(request.nextUrl.pathname);

  // Only auth-aware routes pay for a session check; marketing pages stay static.
  if (!isProtectedPath(path) && !isGuestOnlyPath(path)) return response;

  const { signedIn } = await refreshSession(request, response);

  if (isProtectedPath(path) && !signedIn) {
    const url = new URL(localizedPath(locale, "/login"), request.url);
    url.searchParams.set("next", path + request.nextUrl.search);
    return redirectKeepingCookies(url, response);
  }
  if (isGuestOnlyPath(path) && signedIn) {
    return redirectKeepingCookies(
      new URL(localizedPath(locale, DEFAULT_AFTER_LOGIN), request.url),
      response,
    );
  }
  return response;
}

export const config = {
  // Skip API routes, Next internals, Vercel internals and any path with a file extension
  // (widget.js, icons, images).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};

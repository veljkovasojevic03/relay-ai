import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

import {
  DEFAULT_AFTER_LOGIN,
  isGuestOnlyPath,
  isProtectedPath,
  localizedPath,
  splitLocale,
} from "./lib/auth/redirects";
import { serverEnv } from "./lib/env.server";
import { createNonce, ownerPagesCsp } from "./lib/security/csp";
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

/** The owner's pages: strict CSP and a session check. Marketing pages stay static. */
const isOwnerPage = (path: string) =>
  isProtectedPath(path) || isGuestOnlyPath(path) || path === "/reset-password";

/**
 * Puts a fresh-nonce CSP on the request (Next.js reads the nonce from there for its own
 * scripts) and on the response (where the browser enforces it).
 */
function withCsp(request: NextRequest): { request: NextRequest; csp: string } {
  const csp = ownerPagesCsp({
    nonce: createNonce(),
    supabaseUrl: serverEnv().NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === "development",
  });
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", csp);
  return { request: new NextRequest(request, { headers }), csp };
}

export default async function proxy(incoming: NextRequest) {
  const { locale, path } = splitLocale(incoming.nextUrl.pathname);
  if (!isOwnerPage(path)) return intl(incoming);

  const { request, csp } = withCsp(incoming);
  const response = intl(request);
  response.headers.set("Content-Security-Policy", csp);

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

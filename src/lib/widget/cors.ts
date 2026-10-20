/**
 * CORS for the public widget API (spec §5.3). A response is readable cross-origin only when
 * the request's Origin is one of the bot's allowed origins, or the app itself (dashboard
 * preview, demo store). The exact origin is echoed, never `*`.
 *
 * This keeps casual third-party sites from embedding someone else's bot. It is NOT abuse
 * protection: outside a browser the Origin header can be anything, so rate limits and caps
 * apply to every request.
 */

export const WIDGET_ALLOWED_HEADERS = "Content-Type, X-Relay-Token";
const PREFLIGHT_MAX_AGE = "600";

/** Origin of a URL ("https://shop.example"), or null for anything unparseable. */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const origin = new URL(url).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

export type OriginCheck =
  /** No Origin header: not a browser cross-origin request (curl, a server). */
  { kind: "none" } | { kind: "allowed"; origin: string } | { kind: "denied"; origin: string };

export function checkOrigin(
  requestOrigin: string | null,
  allowedOrigins: readonly string[],
  appOrigin: string | null,
): OriginCheck {
  if (!requestOrigin) return { kind: "none" };
  // Compare normalized origins (lowercase host, default port dropped), like the stored list.
  const normalized = originOf(requestOrigin);
  if (normalized && (normalized === appOrigin || allowedOrigins.includes(normalized))) {
    return { kind: "allowed", origin: requestOrigin };
  }
  return { kind: "denied", origin: requestOrigin };
}

/** Headers for an actual (non-preflight) response. `Vary: Origin` always, for caches. */
export function corsHeaders(check: OriginCheck): Record<string, string> {
  if (check.kind !== "allowed") return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": check.origin,
    "Access-Control-Expose-Headers": "Retry-After",
    Vary: "Origin",
  };
}

/**
 * Preflight answer. A preflight has no body, so it can't name the bot; it is answered for
 * any origin, and the real request is then refused (403, no CORS headers) unless its origin
 * is allowed for that bot. A preflight alone reads nothing.
 */
export function preflightResponse(request: Request, methods: string): Response {
  const origin = request.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: {
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
      "Access-Control-Allow-Methods": `${methods}, OPTIONS`,
      "Access-Control-Allow-Headers": WIDGET_ALLOWED_HEADERS,
      "Access-Control-Max-Age": PREFLIGHT_MAX_AGE,
      Vary: "Origin",
    },
  });
}

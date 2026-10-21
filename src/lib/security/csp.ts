/**
 * Content Security Policy for the owner's pages (dashboard and sign-in forms), where an
 * injected script could act with the owner's session. Built per request with a fresh nonce:
 * Next.js reads the nonce from the request's CSP header and puts it on its own scripts.
 *
 * - Scripts: only nonce-bearing ones, plus what they load (`'strict-dynamic'`, which the
 *   widget preview needs to add /widget.js). No `'unsafe-inline'`, no `eval` in production.
 * - Styles keep `'unsafe-inline'`: React `style` props, Recharts and the widget's Shadow DOM
 *   `<style>` all need it, and a nonce would make browsers ignore it. Injected CSS can't run code.
 * - Network: the app itself and the Supabase project (REST, Auth, Storage, Realtime over wss).
 * - Forms may also end at Supabase Auth (Google sign-in) or Stripe (Checkout, Portal): without
 *   JavaScript those form posts finish with a redirect there, and Chrome checks `form-action`
 *   on redirects.
 */
export function ownerPagesCsp({
  nonce,
  supabaseUrl,
  dev = false,
}: {
  nonce: string;
  supabaseUrl?: string;
  dev?: boolean;
}): string {
  const supabase = supabaseOrigins(supabaseUrl);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // React needs eval in development for its error overlays; never in production.
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:", ...supabase.http],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...supabase.http, ...supabase.ws],
    "frame-src": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": [
      "'self'",
      // Google sign-in starts with a redirect to Supabase Auth.
      ...supabase.http,
      "https://checkout.stripe.com",
      "https://billing.stripe.com",
    ],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

function supabaseOrigins(url: string | undefined): { http: string[]; ws: string[] } {
  if (!url) return { http: [], ws: [] };
  try {
    const { origin, protocol, host } = new URL(url);
    return { http: [origin], ws: [`${protocol === "https:" ? "wss" : "ws"}://${host}`] };
  } catch {
    return { http: [], ws: [] };
  }
}

/** 128 random bits, base64. Fresh for every request. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

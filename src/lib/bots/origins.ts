import type { ErrorKey } from "@/lib/validation/errors";

export const MAX_ORIGINS = 20;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export type OriginResult = { ok: true; origin: string } | { ok: false; error: ErrorKey };

/**
 * Turns what an owner types ("Kroj.rs/shop", "https://www.kroj.rs/") into a browser Origin
 * ("https://www.kroj.rs"): scheme + lowercase host + non-default port, no path. Must match
 * what browsers send in the `Origin` header, and what the DB check constraint accepts.
 */
export function normalizeOrigin(input: string): OriginResult {
  const raw = input.trim();
  if (!raw || raw.length > 300) return { ok: false, error: "invalidOrigin" };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: "invalidOrigin" };
  }
  if (url.username || url.password) return { ok: false, error: "invalidOrigin" };

  const host = url.hostname.toLowerCase();
  const local = LOCAL_HOSTS.has(host);
  if (url.protocol === "http:" && !local) return { ok: false, error: "httpsRequired" };
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "httpsRequired" };
  }
  // A public site needs a dotted hostname made of DNS labels (rejects "shop", "a..b", IPv6).
  const labels = host.split(".");
  const validLabels = labels.every((l) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(l));
  if (!local && (labels.length < 2 || !validLabels)) return { ok: false, error: "invalidOrigin" };

  // URL already drops default ports (":443" for https, ":80" for http).
  return { ok: true, origin: `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}` };
}

/** Normalizes a whole list: first error wins; duplicates are rejected, not silently merged. */
export function normalizeOrigins(
  inputs: readonly string[],
): { ok: true; origins: string[] } | { ok: false; error: ErrorKey; index: number } {
  if (inputs.length > MAX_ORIGINS)
    return { ok: false, error: "tooManyOrigins", index: MAX_ORIGINS };
  const seen = new Set<string>();
  const origins: string[] = [];
  for (const [index, input] of inputs.entries()) {
    const result = normalizeOrigin(input);
    if (!result.ok) return { ok: false, error: result.error, index };
    if (seen.has(result.origin)) return { ok: false, error: "duplicateOrigin", index };
    seen.add(result.origin);
    origins.push(result.origin);
  }
  return { ok: true, origins };
}

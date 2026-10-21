/**
 * Server-side check of a Cloudflare Turnstile token (siteverify). A token is single-use and
 * valid for 5 minutes; Cloudflare enforces both. Never throws: any failure is "not verified".
 */

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult =
  { ok: true } | { ok: false; reason: "missing_token" | "rejected" | "unavailable" };

export async function verifyTurnstile(
  token: unknown,
  options: { secret: string; ip?: string | null; fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<TurnstileResult> {
  // Cloudflare's tokens are at most 2048 characters.
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: "missing_token" };
  }
  const body = new URLSearchParams({ secret: options.secret, response: token });
  if (options.ip) body.set("remoteip", options.ip);

  try {
    const response = await (options.fetchImpl ?? fetch)(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
    });
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const result = (await response.json()) as { success?: unknown };
    return result.success === true ? { ok: true } : { ok: false, reason: "rejected" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

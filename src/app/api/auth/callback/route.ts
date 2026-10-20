import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { authErrorKey } from "@/lib/auth/errors";
import { localizedPath, safeNext } from "@/lib/auth/redirects";
import { serverEnv } from "@/lib/env.server";
import { log } from "@/lib/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

/**
 * Landing point for Supabase email links and OAuth. Handles both the PKCE `code` flow and
 * the `token_hash` flow (for email templates that link here directly), then redirects to a
 * validated same-origin `next` path.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const { locale, path: next } = safeNext(params.get("next"));
  const base = serverEnv().NEXT_PUBLIC_APP_URL;

  const redirectTo = (path: string) => {
    const response = NextResponse.redirect(new URL(path, base));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const fail = (error: string) => redirectTo(`${localizedPath(locale, "/login")}?error=${error}`);

  // The provider or Supabase reported a problem (e.g. the user cancelled Google consent).
  if (params.get("error")) {
    log.info("auth.callback_provider_error", { code: params.get("error_code") ?? "unknown" });
    return fail("linkInvalid");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("notConfigured");

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type && OTP_TYPES.includes(type)
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: { code: "missing_params" } };

  if (error) {
    log.info("auth.callback_failed", { code: error.code ?? "unknown" });
    // Supabase only redirects here with a `code` after it has verified the email (bad or
    // expired links arrive with `error` params, handled above). If the code can't be
    // exchanged, the link was opened in another browser than the one that signed up: the
    // address IS confirmed, there just is no session here. Say so instead of "invalid link".
    if (code && params.get("flow") === "signup") {
      return redirectTo(`${localizedPath(locale, "/login")}?notice=emailConfirmed`);
    }
    const key = authErrorKey(error);
    return fail(key === "generic" ? "linkInvalid" : key);
  }
  return redirectTo(localizedPath(locale, next));
}

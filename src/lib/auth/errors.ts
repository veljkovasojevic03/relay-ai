import type { ErrorKey } from "@/lib/validation/auth";

/**
 * Maps Supabase Auth error codes to message keys. Anything unexpected becomes `generic`,
 * so raw server messages never reach the UI.
 */
const AUTH_ERROR_MAP: Record<string, ErrorKey> = {
  invalid_credentials: "invalidCredentials",
  email_not_confirmed: "emailNotConfirmed",
  weak_password: "weakPassword",
  same_password: "weakPassword",
  over_request_rate_limit: "rateLimited",
  over_email_send_rate_limit: "rateLimited",
  over_sms_send_rate_limit: "rateLimited",
  session_not_found: "sessionExpired",
  session_expired: "sessionExpired",
  reauthentication_needed: "sessionExpired",
  otp_expired: "linkInvalid",
  bad_code_verifier: "linkInvalid",
  flow_state_expired: "linkInvalid",
  flow_state_not_found: "linkInvalid",
  provider_disabled: "oauthUnavailable",
  validation_failed: "invalidEmail",
  email_address_invalid: "invalidEmail",
};

export function authErrorKey(error: { code?: string | null; status?: number } | null): ErrorKey {
  if (!error) return "generic";
  if (error.code && error.code in AUTH_ERROR_MAP) return AUTH_ERROR_MAP[error.code]!;
  if (error.status === 429) return "rateLimited";
  return "generic";
}

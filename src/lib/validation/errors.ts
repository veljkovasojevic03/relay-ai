import type { z } from "zod";

/**
 * Error keys shared by every form. Schemas use them as messages, and the UI translates them
 * from `Errors.*`, so one schema produces English and Serbian messages.
 */
export const ERROR_KEYS = [
  "required",
  "invalidEmail",
  "passwordTooShort",
  "passwordTooLong",
  "passwordMismatch",
  "nameTooLong",
  "invalidCredentials",
  "emailNotConfirmed",
  "weakPassword",
  "rateLimited",
  "sessionExpired",
  "linkInvalid",
  "oauthUnavailable",
  "notConfigured",
  "tooLong",
  "invalidColor",
  "invalidOrigin",
  "httpsRequired",
  "duplicateOrigin",
  "tooManyOrigins",
  "tooManyQuestions",
  "botLimitReached",
  "logoType",
  "logoTooLarge",
  "logoMissing",
  "notFound",
  "faqLimitReached",
  "embedUnavailable",
  "importEmpty",
  "importTooMany",
  "generic",
] as const;
export type ErrorKey = (typeof ERROR_KEYS)[number];
export type FieldErrors = Partial<Record<string, ErrorKey>>;

export const isErrorKey = (value: unknown): value is ErrorKey =>
  (ERROR_KEYS as readonly unknown[]).includes(value);

/** First error per field, as catalog keys. Unknown messages fall back to `generic`. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    out[field] ??= isErrorKey(issue.message) ? issue.message : "generic";
  }
  return out;
}

/** Reads a FormData into a plain object of strings (files and repeats are ignored). */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !(key in out)) out[key] = value;
  }
  return out;
}

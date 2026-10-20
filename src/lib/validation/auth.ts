import { z } from "zod";

/**
 * Form schemas shared by Server Actions. Error messages are message-catalog keys under
 * `Errors.*`, so the same schema produces English and Serbian messages.
 */

const email = z
  .string({ error: "required" })
  .trim()
  .toLowerCase()
  .min(1, { error: "required" })
  .max(254, { error: "invalidEmail" })
  .pipe(z.email({ error: "invalidEmail" }));

// Supabase (bcrypt) ignores bytes past 72, so longer passwords would silently truncate.
const newPassword = z
  .string({ error: "required" })
  .min(8, { error: "passwordTooShort" })
  .max(72, { error: "passwordTooLong" });

const displayName = z
  .string()
  .trim()
  .max(80, { error: "nameTooLong" })
  .transform((v) => (v === "" ? null : v));

export const signInSchema = z.object({
  email,
  password: z.string({ error: "required" }).min(1, { error: "required" }).max(72),
  next: z.string().optional(),
});

export const signUpSchema = z.object({
  displayName: displayName.optional(),
  email,
  password: newPassword,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword: z.string({ error: "required" }) })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    error: "passwordMismatch",
  });

export const profileSchema = z.object({
  displayName,
  uiLanguage: z.enum(["en", "sr"], { error: "required" }),
  notificationEmail: email,
});

export type FieldErrors = Partial<Record<string, ErrorKey>>;

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
  "generic",
] as const;
export type ErrorKey = (typeof ERROR_KEYS)[number];

const isErrorKey = (value: string): value is ErrorKey =>
  (ERROR_KEYS as readonly string[]).includes(value);

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
  for (const [key, value] of formData)
    if (typeof value === "string" && !(key in out)) out[key] = value;
  return out;
}

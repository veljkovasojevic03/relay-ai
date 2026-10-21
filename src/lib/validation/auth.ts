import { z } from "zod";

export { ERROR_KEYS, fieldErrors, formValues } from "./errors";
export type { ErrorKey, FieldErrors } from "./errors";

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
  // A checkbox: present ("on") when ticked, absent otherwise.
  weeklyDigest: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

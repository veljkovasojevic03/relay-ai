import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { authErrorKey } from "@/lib/auth/errors";

import {
  fieldErrors,
  formValues,
  profileSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "./auth";

const errorsOf = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  return result.success ? {} : fieldErrors(result.error);
};

describe("auth schemas", () => {
  it("normalizes email and accepts a valid sign-up", () => {
    const result = signUpSchema.parse({
      displayName: "  Ana ",
      email: "  Ana@Shop.RS ",
      password: "correct horse",
    });
    expect(result).toEqual({ displayName: "Ana", email: "ana@shop.rs", password: "correct horse" });
  });

  it("returns catalog keys for each invalid field", () => {
    expect(errorsOf(signUpSchema, { email: "nope", password: "short" })).toEqual({
      email: "invalidEmail",
      password: "passwordTooShort",
    });
    expect(errorsOf(signUpSchema, { email: "a@b.co", password: "x".repeat(73) })).toEqual({
      password: "passwordTooLong",
    });
    expect(errorsOf(signInSchema, { email: "", password: "" })).toEqual({
      email: "required",
      password: "required",
    });
  });

  it("requires matching passwords on reset", () => {
    expect(
      errorsOf(resetPasswordSchema, { password: "longenough", confirmPassword: "different" }),
    ).toEqual({ confirmPassword: "passwordMismatch" });
  });

  it("validates the profile form", () => {
    expect(
      profileSchema.parse({ displayName: "", uiLanguage: "sr", notificationEmail: "x@y.rs" }),
    ).toEqual({ displayName: null, uiLanguage: "sr", notificationEmail: "x@y.rs" });
    expect(
      errorsOf(profileSchema, {
        displayName: "n".repeat(81),
        uiLanguage: "de",
        notificationEmail: "x",
      }),
    ).toEqual({
      displayName: "nameTooLong",
      uiLanguage: "required",
      notificationEmail: "invalidEmail",
    });
  });

  it("reads only string form values", () => {
    const fd = new FormData();
    fd.append("email", "a@b.co");
    fd.append("email", "second@b.co");
    fd.append("file", new Blob(["x"]));
    expect(formValues(fd)).toEqual({ email: "a@b.co" });
  });
});

describe("authErrorKey", () => {
  it("maps known Supabase codes and hides unknown ones", () => {
    expect(authErrorKey({ code: "invalid_credentials" })).toBe("invalidCredentials");
    expect(authErrorKey({ code: "over_email_send_rate_limit" })).toBe("rateLimited");
    expect(authErrorKey({ status: 429 })).toBe("rateLimited");
    expect(authErrorKey({ code: "something_new", status: 500 })).toBe("generic");
    expect(authErrorKey(null)).toBe("generic");
  });
});

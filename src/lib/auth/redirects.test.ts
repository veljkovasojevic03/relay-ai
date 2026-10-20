import { describe, expect, it } from "vitest";

import {
  isGuestOnlyPath,
  isProtectedPath,
  localizedPath,
  safeNext,
  safeNextPath,
  splitLocale,
} from "./redirects";

describe("splitLocale", () => {
  it.each([
    ["/", "en", "/"],
    ["/dashboard", "en", "/dashboard"],
    ["/sr", "sr", "/"],
    ["/sr/", "sr", "/"],
    ["/sr/dashboard/account", "sr", "/dashboard/account"],
    ["/en/login", "en", "/login"],
    ["/srb/login", "en", "/srb/login"],
  ])("%s → %s %s", (pathname, locale, path) => {
    expect(splitLocale(pathname)).toEqual({ locale, path });
  });
});

describe("route guards", () => {
  it("protects the dashboard tree only", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/account")).toBe(true);
    expect(isProtectedPath("/dashboards")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
  });

  it("bounces signed-in owners from guest pages but not from password reset", () => {
    expect(isGuestOnlyPath("/login")).toBe(true);
    expect(isGuestOnlyPath("/signup")).toBe(true);
    expect(isGuestOnlyPath("/reset-password")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/dashboard/account", "/dashboard/account"],
    ["/sr/dashboard", "/dashboard"],
    ["/dashboard?tab=1", "/dashboard?tab=1"],
  ])("keeps %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    undefined,
    "",
    "dashboard",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example/dashboard",
    "javascript:alert(1)",
    "/dash\nboard",
    "/ok\\evil.example",
    "/" + "a".repeat(600),
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBe("/dashboard");
  });
});

describe("safeNext", () => {
  it("returns the locale of a valid next and the default locale otherwise", () => {
    expect(safeNext("/sr/reset-password")).toEqual({ locale: "sr", path: "/reset-password" });
    expect(safeNext("//evil.example/sr")).toEqual({ locale: "en", path: "/dashboard" });
  });
});

describe("localizedPath", () => {
  it("omits the prefix for the default locale", () => {
    expect(localizedPath("en", "/dashboard")).toBe("/dashboard");
    expect(localizedPath("sr", "/dashboard")).toBe("/sr/dashboard");
    expect(localizedPath("sr", "/")).toBe("/sr");
  });
});

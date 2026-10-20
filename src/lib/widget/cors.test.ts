import { describe, expect, it } from "vitest";

import { checkOrigin, corsHeaders, originOf, preflightResponse } from "./cors";

const allowed = ["https://kroj.rs", "http://localhost:5500"];
const app = "https://relay-ai.vercel.app";

describe("checkOrigin", () => {
  it("echoes an allowed origin exactly, with Vary: Origin", () => {
    const check = checkOrigin("https://kroj.rs", allowed, app);
    expect(check).toEqual({ kind: "allowed", origin: "https://kroj.rs" });
    expect(corsHeaders(check)).toEqual({
      "Access-Control-Allow-Origin": "https://kroj.rs",
      "Access-Control-Expose-Headers": "Retry-After",
      Vary: "Origin",
    });
  });

  it("normalizes the request origin like the stored list", () => {
    expect(checkOrigin("https://KROJ.rs:443", allowed, app).kind).toBe("allowed");
    expect(checkOrigin("http://localhost:5500", allowed, app).kind).toBe("allowed");
  });

  it("always allows the app's own origin (dashboard preview, demo store)", () => {
    expect(checkOrigin(app, [], app).kind).toBe("allowed");
  });

  it.each([
    "https://evil.example",
    "https://kroj.rs.evil.example",
    "http://kroj.rs",
    "https://kroj.rs:8443",
    "null",
    "not a url",
  ])("denies %s and sends no Allow-Origin", (origin) => {
    const check = checkOrigin(origin, allowed, app);
    expect(check.kind).toBe("denied");
    expect(corsHeaders(check)).toEqual({ Vary: "Origin" });
  });

  it("treats a request without Origin as non-browser (no CORS headers needed)", () => {
    const check = checkOrigin(null, allowed, app);
    expect(check).toEqual({ kind: "none" });
    expect(corsHeaders(check)).toEqual({ Vary: "Origin" });
  });
});

describe("originOf", () => {
  it("reduces URLs to their origin", () => {
    expect(originOf("https://relay.example/path?q=1")).toBe("https://relay.example");
    expect(originOf("garbage")).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });
});

describe("preflightResponse", () => {
  it("allows the widget's method and headers, cached briefly, varying by origin", () => {
    const response = preflightResponse(
      new Request("https://app.example/api/widget/message", {
        method: "OPTIONS",
        headers: { Origin: "https://kroj.rs" },
      }),
      "POST",
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://kroj.rs");
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Relay-Token");
    expect(response.headers.get("vary")).toBe("Origin");
  });
});

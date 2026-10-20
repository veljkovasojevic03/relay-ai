import { describe, expect, it } from "vitest";

import { parseFrame } from "./api";
import { foregroundFor } from "./widget";

describe("parseFrame", () => {
  it("reads the server's event frames", () => {
    expect(parseFrame('event: delta\ndata: {"text":"Hi"}')).toEqual({
      event: "delta",
      data: { text: "Hi" },
    });
  });

  it("ignores malformed frames instead of throwing", () => {
    expect(parseFrame("event: delta")).toBeNull();
    expect(parseFrame("data: {}")).toBeNull();
    expect(parseFrame("event: delta\ndata: {not json")).toBeNull();
    expect(parseFrame(": keep-alive comment")).toBeNull();
  });
});

describe("foregroundFor", () => {
  it.each([
    ["#b3472b", "#ffffff"],
    ["#ffffff", "#1f1a17"],
    ["#f5d90a", "#1f1a17"],
    ["#1d4ed8", "#ffffff"],
    ["oops", "#ffffff"],
  ])("%s → %s", (brand, fg) => {
    expect(foregroundFor(brand)).toBe(fg);
  });
});

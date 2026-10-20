import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, readableForeground } from "./contrast";

// Reads the real tokens from globals.css so the test fails if someone edits a color there.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const rootBlock = /:root\s*{([^}]*)}/.exec(css)?.[1] ?? "";
const tokens = Object.fromEntries(
  [...rootBlock.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
);

function token(name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`Token --${name} missing from :root`);
  return value;
}

// [foreground, background, minimum ratio]. 4.5 = AA body text, 3 = AA UI components / large text.
const pairs: Array<[string, string, number]> = [
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["muted-foreground", "card", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["primary-foreground", "primary-hover", 4.5],
  ["primary", "background", 4.5],
  ["primary", "card", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["success", "background", 4.5],
  ["background", "foreground", 4.5],
  ["ring", "background", 3],
  // Form control boundaries (WCAG 1.4.11).
  ["input", "background", 3],
  ["input", "card", 3],
  ["input", "muted", 3],
  ["sidebar-foreground", "sidebar", 4.5],
  ["sidebar-accent-foreground", "sidebar-accent", 4.5],
];

describe("design tokens", () => {
  it("parses the token block", () => {
    expect(Object.keys(tokens).length).toBeGreaterThan(20);
  });

  it.each(pairs)("--%s on --%s meets %s:1", (fg, bg, min) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(min);
  });
});

describe("contrastRatio", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(() => contrastRatio("red", "#fff")).toThrow();
  });
});

describe("readableForeground", () => {
  it.each([
    ["#b3472b", "#ffffff"],
    ["#000000", "#ffffff"],
    ["#ffffff", "#1f1a17"],
    ["#ffd400", "#1f1a17"],
    ["#0ea5e9", "#1f1a17"],
  ])("on %s uses %s", (bg, fg) => {
    expect(readableForeground(bg).color).toBe(fg);
  });

  it("always reaches at least AA large-text contrast, whatever the brand color", () => {
    for (let v = 0; v <= 0xffffff; v += 0x050505) {
      const hex = `#${v.toString(16).padStart(6, "0")}`;
      expect(readableForeground(hex).ratio, hex).toBeGreaterThanOrEqual(3);
    }
  });
});

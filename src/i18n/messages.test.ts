import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import sr from "../../messages/sr.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

function leaves(value: unknown): unknown[] {
  if (typeof value !== "object" || value === null) return [value];
  return Object.values(value).flatMap(leaves);
}

describe("message catalogs", () => {
  it("sr has exactly the same keys as en", () => {
    expect(keys(sr).sort()).toEqual(keys(en).sort());
  });

  it.each([
    ["en", en],
    ["sr", sr],
  ])("%s has no empty strings", (_locale, catalog) => {
    for (const leaf of leaves(catalog)) {
      expect(typeof leaf).toBe("string");
      expect((leaf as string).trim()).not.toBe("");
    }
  });
});

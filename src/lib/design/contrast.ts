/** WCAG 2.x relative luminance and contrast ratio for #RRGGBB colors. */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) throw new Error(`Expected #RRGGBB, got ${hex}`);
  const n = parseInt(match[1], 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const LIGHT_TEXT = "#ffffff";
const DARK_TEXT = "#1f1a17";

/** Picks the text color (white or ink) with the higher contrast on `background`. */
export function readableForeground(background: string): { color: string; ratio: number } {
  const light = contrastRatio(LIGHT_TEXT, background);
  const dark = contrastRatio(DARK_TEXT, background);
  return light >= dark ? { color: LIGHT_TEXT, ratio: light } : { color: DARK_TEXT, ratio: dark };
}

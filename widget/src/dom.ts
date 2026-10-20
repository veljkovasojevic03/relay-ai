/** Tiny element helpers: everything is created as nodes, text only through textContent. */

type Attrs = Record<string, string | number | boolean | null | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | false | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (name === "text") el.textContent = String(value);
    else el.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child === null || child === false || child === undefined) continue;
    el.appendChild(typeof child === "string" ? doc.createTextNode(child) : child);
  }
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Stroke icons (24×24), drawn as path data only.
const ICONS = {
  chat: ["M7.9 20A9 9 0 1 0 4 16.1L2 22Z", "M8 12h.01", "M12 12h.01", "M16 12h.01"],
  close: ["M18 6 6 18", "m6 6 12 12"],
  minimize: ["m6 9 6 6 6-6"],
  send: ["m22 2-7 20-4-9-9-4Z", "M22 2 11 13"],
} as const;

export type IconName = keyof typeof ICONS;

export function icon(doc: Document, name: IconName): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of ICONS[name]) {
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/** Focusable descendants, for the panel's focus trap. */
export function focusables(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]),textarea:not([disabled]),input:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.closest("[hidden]"));
}

/**
 * The widget's whole formatting vocabulary (spec §5.7): paragraphs and line breaks, **bold**,
 * "- " / "1. " lists, and https links ([text](https://…) or a bare https:// URL).
 *
 * Output is built from DOM nodes with text set through `textContent` / `createTextNode`.
 * Nothing is ever parsed as HTML, so markup in a reply is shown as the characters it is.
 */

const LINK = /\[([^\]\n]{1,200})\]\((https:\/\/[^\s)]{1,2000})\)|(https:\/\/[^\s<>()]{1,2000})/g;
const BOLD = /\*\*([^*\n]{1,500})\*\*/g;

/** A safe https URL, or null. Only https; credentials in URLs are refused. */
export function safeHttpsUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function link(doc: Document, text: string, href: string): HTMLAnchorElement {
  const a = doc.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer nofollow";
  a.textContent = text;
  return a;
}

/** Bold runs inside a piece of text that has no links. */
function appendBold(doc: Document, parent: Node, text: string) {
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    if (match.index > last) parent.appendChild(doc.createTextNode(text.slice(last, match.index)));
    const strong = doc.createElement("strong");
    strong.textContent = match[1]!;
    parent.appendChild(strong);
    last = match.index + match[0].length;
  }
  if (last < text.length) parent.appendChild(doc.createTextNode(text.slice(last)));
}

/** One line of inline text: links first, then bold in the text between them. */
export function appendInline(doc: Document, parent: Node, text: string) {
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label, labelled, bare] = match;
    // A bare URL ending a sentence shouldn't swallow the punctuation.
    const url = bare ? bare.replace(/[.,;:!?]+$/, "") : labelled!;
    const href = safeHttpsUrl(url);
    if (!href) continue;
    if (match.index > last) appendBold(doc, parent, text.slice(last, match.index));
    parent.appendChild(link(doc, label ?? url, href));
    last = match.index + (bare ? url.length : whole.length);
  }
  if (last < text.length) appendBold(doc, parent, text.slice(last));
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;

/** Renders reply text into a fragment of <p>, <ul>/<ol>, <strong>, <a> and text nodes. */
export function renderMarkdown(doc: Document, text: string): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) continue;

    const list = lines.every((l) => BULLET.test(l))
      ? { tag: "ul" as const, pattern: BULLET }
      : lines.every((l) => NUMBERED.test(l))
        ? { tag: "ol" as const, pattern: NUMBERED }
        : null;

    if (list) {
      const el = doc.createElement(list.tag);
      for (const line of lines) {
        const li = doc.createElement("li");
        appendInline(doc, li, list.pattern.exec(line)![1]!);
        el.appendChild(li);
      }
      fragment.appendChild(el);
      continue;
    }

    const p = doc.createElement("p");
    lines.forEach((line, i) => {
      if (i > 0) p.appendChild(doc.createElement("br"));
      appendInline(doc, p, line);
    });
    fragment.appendChild(p);
  }
  return fragment;
}

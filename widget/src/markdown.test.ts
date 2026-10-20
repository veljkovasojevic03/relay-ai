// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { renderMarkdown, safeHttpsUrl } from "./markdown";

function render(text: string): HTMLDivElement {
  const div = document.createElement("div");
  div.appendChild(renderMarkdown(document, text));
  return div;
}

/** Every element in the output must be one the renderer is allowed to produce. */
const ALLOWED = new Set(["DIV", "P", "BR", "STRONG", "UL", "OL", "LI", "A"]);
function assertSafe(root: Element) {
  for (const el of root.querySelectorAll("*")) {
    expect(ALLOWED.has(el.tagName)).toBe(true);
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.startsWith("on")).toBe(false);
      if (el.tagName === "A") expect(["href", "target", "rel"]).toContain(attr.name);
      else throw new Error(`unexpected attribute ${attr.name} on ${el.tagName}`);
    }
    if (el.tagName === "A") {
      expect(el.getAttribute("href")).toMatch(/^https:\/\//);
      expect(el.getAttribute("rel")).toBe("noopener noreferrer nofollow");
      expect(el.getAttribute("target")).toBe("_blank");
    }
  }
}

describe("renderMarkdown", () => {
  it("renders paragraphs, line breaks, bold, lists and https links", () => {
    const root = render(
      "Delivery takes **1–3 days**.\nTracking by email.\n\n- Card\n- Cash on delivery\n\n1. Pack it\n2. Book a pickup\n\nSee [our returns page](https://kroj.example/returns) or https://kroj.example/faq.",
    );
    assertSafe(root);
    const ps = root.querySelectorAll("p");
    expect(ps[0]!.querySelector("strong")!.textContent).toBe("1–3 days");
    expect(ps[0]!.querySelectorAll("br")).toHaveLength(1);
    expect(Array.from(root.querySelectorAll("ul li")).map((li) => li.textContent)).toEqual([
      "Card",
      "Cash on delivery",
    ]);
    expect(root.querySelectorAll("ol li")).toHaveLength(2);
    const links = Array.from(root.querySelectorAll("a"));
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["our returns page", "https://kroj.example/returns"],
      ["https://kroj.example/faq", "https://kroj.example/faq"],
    ]);
    // Trailing sentence punctuation stays text.
    expect(ps[ps.length - 1]!.textContent!.endsWith("faq.")).toBe(true);
  });

  it.each([
    '<img src=x onerror="alert(1)">',
    "<script>alert(document.cookie)</script>",
    '<a href="javascript:alert(1)">click</a>',
    "<svg onload=alert(1)><circle/></svg>",
    '"><iframe src="https://evil.example"></iframe>',
    "<style>*{display:none}</style>",
    "&lt;b&gt;encoded&lt;/b&gt; &amp;",
  ])("shows HTML as literal text: %s", (payload) => {
    const root = render(`Hello ${payload} world`);
    assertSafe(root);
    expect(root.textContent).toBe(`Hello ${payload} world`);
  });

  it.each([
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](data:text/html,<script>alert(1)</script>)",
    "[click](http://plain-http.example)",
    "[click](//evil.example)",
    "[click](https://user:pass@evil.example)",
    "[x](vbscript:msgbox(1))",
  ])("refuses unsafe link targets: %s", (payload) => {
    const root = render(payload);
    assertSafe(root);
    expect(root.querySelector("a")).toBeNull();
    expect(root.textContent).toBe(payload);
  });

  it("can't break out of an https link's attribute", () => {
    const root = render('[x](https://ok.example/" onmouseover="alert(1))');
    assertSafe(root);
    for (const a of root.querySelectorAll("a")) {
      expect(a.getAttributeNames().sort()).toEqual(["href", "rel", "target"]);
    }
  });

  it("keeps markup inside bold and link text as text", () => {
    const root = render("**<img src=x onerror=alert(1)>** and [<b>bold</b>](https://ok.example)");
    assertSafe(root);
    expect(root.querySelector("strong")!.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(root.querySelector("a")!.textContent).toBe("<b>bold</b>");
  });

  it("handles empty and whitespace-only text", () => {
    expect(render("").childNodes).toHaveLength(0);
    expect(render(" \n\n \n").childNodes).toHaveLength(0);
  });
});

describe("safeHttpsUrl", () => {
  it("accepts https only, normalized", () => {
    expect(safeHttpsUrl("https://Kroj.example/a b")).toBe("https://kroj.example/a%20b");
    expect(safeHttpsUrl("http://kroj.example")).toBeNull();
    expect(safeHttpsUrl("not a url")).toBeNull();
  });
});

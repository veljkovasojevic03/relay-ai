# widget/

The embeddable chat widget: vanilla TypeScript, Shadow DOM, no dependencies. esbuild bundles it
into `public/widget.js` through `scripts/build-widget.mjs`, and the build fails above 30 KB
gzipped.

| File          | Role                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `index.ts`    | Reads the `<script data-bot>` tag and mounts; `RelayAI.preview()`, `.ask()` |
| `widget.ts`   | UI and state: launcher, panel, streaming, resume, end chat and rating       |
| `api.ts`      | Client for `/api/widget/*`, including the SSE reader                        |
| `markdown.ts` | Whitelist renderer: DOM nodes and text nodes only, never `innerHTML`        |
| `styles.ts`   | All CSS, scoped to the shadow root                                          |
| `i18n.ts`     | English and Serbian strings, and how the language is picked                 |
| `storage.ts`  | The visitor's conversation token in `localStorage` (the only stored value)  |

Tests: `markdown.test.ts` and `api.test.ts` (Vitest), and `e2e/widget.spec.ts` (Playwright, on
a hostile third-party page served from another origin).

Host pages can open the chat with a question: `window.RelayAI.ask("Track my order")` returns
`false` while the widget is still loading. The demo store's "Try these" panel uses it.

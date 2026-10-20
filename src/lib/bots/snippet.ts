/** The one line an owner pastes on their shop (spec §4.2). */
export function embedSnippet(appUrl: string, publicKey: string): string {
  const src = new URL("/widget.js", appUrl).toString();
  return `<script src="${src}" data-bot="${publicKey}" async></script>`;
}

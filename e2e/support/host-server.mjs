#!/usr/bin/env node
// A plain third-party "shop" page on its own origin for the widget e2e tests. It embeds the
// widget exactly like an owner would (the real snippet), next to deliberately hostile CSS
// that tries to restyle, hide and recolor everything.
//
//   GET /?bot=<public key>&app=<app origin>

import { createServer } from "node:http";

const PORT = Number(process.env.HOST_PORT ?? 3101);

const HOSTILE_CSS = `
* { font-family: "Comic Sans MS", cursive !important; font-size: 31px !important;
    color: rgb(255, 0, 0) !important; background: rgb(0, 255, 0) !important;
    line-height: 3 !important; letter-spacing: 4px !important; }
div, button, p, textarea, section { display: none !important; border: 9px dashed blue !important; }
relay-ai-widget { display: none !important; position: absolute !important; opacity: 0 !important; }
body > * { visibility: hidden !important; }
`;

const page = (bot, app) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Hostile host shop</title>
<style>${HOSTILE_CSS}</style>
</head>
<body>
<h1>A shop that styles everything</h1>
<script src="${app}/widget.js" data-bot="${bot}" async></script>
</body>
</html>`;

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/health") {
    res.writeHead(200).end("ok");
    return;
  }
  const bot = url.searchParams.get("bot") ?? "";
  const app = url.searchParams.get("app") ?? "";
  // Only test values ever reach the template.
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(bot) || !/^http:\/\/localhost:\d+$/.test(app)) {
    res.writeHead(400).end("bad request");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(page(bot, app));
}).listen(PORT, () => console.log(`host page on http://localhost:${PORT}`));

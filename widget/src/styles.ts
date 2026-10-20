/**
 * All widget CSS, scoped to its shadow root. `:host` resets inherited properties, so the
 * host page's fonts, colors and sizes never leak in, and nothing here can leak out. The
 * only inputs are --relay-brand / --relay-fg from the bot's config.
 */
export const CSS = `
:host{all:initial}
*,*::before,*::after{box-sizing:border-box}
.root{
  --relay-brand:#b3472b;--relay-fg:#fff;
  --ink:#1f1a17;--muted:#5f544b;--line:#e4dbd1;--paper:#fffdf9;--bubble:#f3ece3;--danger:#a3261d;
  position:fixed;bottom:20px;right:20px;z-index:2147483000;
  display:flex;flex-direction:column;align-items:flex-end;gap:12px;
  font:400 15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  color:var(--ink);text-align:left;letter-spacing:normal;
  -webkit-font-smoothing:antialiased;
}
.root.left{right:auto;left:20px;align-items:flex-start}
.root.inline{width:100%;min-width:0;position:relative;bottom:auto;right:auto;left:auto;z-index:auto}
.root.inline .panel{width:100%;height:440px;animation:none}
.root.inline .msg{animation:none}
button,input,textarea{font:inherit;color:inherit;margin:0}
button{cursor:pointer}
:focus-visible{outline:3px solid var(--relay-brand);outline-offset:2px}
.sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

.launcher{
  width:56px;height:56px;border-radius:50%;border:0;padding:0;
  background:var(--relay-brand);color:var(--relay-fg);
  display:grid;place-items:center;
  box-shadow:0 6px 20px rgba(31,26,23,.28),0 0 0 1px rgba(255,255,255,.4);
  transition:transform .18s ease;
}
.launcher:hover{transform:scale(1.05)}
.launcher{position:relative}
.launcher.has-unread::after{content:"";position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:50%;background:#d92d20;border:2px solid #fff}
.launcher svg{width:26px;height:26px}

.panel{
  width:min(380px,calc(100vw - 32px));height:min(600px,calc(100vh - 110px));
  display:flex;flex-direction:column;overflow:hidden;
  background:var(--paper);border:1px solid var(--line);border-radius:18px;
  box-shadow:0 18px 48px rgba(31,26,23,.28);
  transform-origin:bottom right;animation:open .2s ease-out;
}
.root.left .panel{transform-origin:bottom left}
.panel[hidden]{display:none}
@keyframes open{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}

.head{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;background:var(--relay-brand);color:var(--relay-fg)}
.avatar{width:34px;height:34px;border-radius:50%;flex:none;display:grid;place-items:center;overflow:hidden;
  background:rgba(255,255,255,.22);font-weight:700}
.avatar img{width:100%;height:100%;object-fit:cover;background:#fff}
.who{flex:1;min-width:0}
.who h2{margin:0;font-size:15px;font-weight:650;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.who p{margin:0;font-size:12.5px;opacity:.9}
.icon{width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:inherit;display:grid;place-items:center}
.icon:hover{background:rgba(255,255,255,.18)}
.icon svg{width:20px;height:20px}

.log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}
.msg{max-width:85%;display:flex;flex-direction:column;gap:4px;animation:settle .22s ease-out}
@keyframes settle{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.bubble{padding:9px 12px;border-radius:16px;overflow-wrap:anywhere;white-space:normal}
.bubble p{margin:0}.bubble p+p,.bubble p+ul,.bubble p+ol,.bubble ul+p,.bubble ol+p{margin-top:8px}
.bubble ul,.bubble ol{margin:4px 0 0;padding-left:20px}
.bubble a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.msg.visitor{align-self:flex-end}
.msg.visitor .bubble{background:var(--relay-brand);color:var(--relay-fg);border-bottom-right-radius:6px;white-space:pre-wrap}
.msg.bot,.msg.human{align-self:flex-start}
.msg.bot .bubble,.msg.human .bubble{background:var(--bubble);border-bottom-left-radius:6px}
.msg.human .bubble{background:#fff;border:1px solid var(--line)}
.msg.system{align-self:center;max-width:100%}
.msg.system .bubble{background:transparent;color:var(--muted);font-size:13px;text-align:center;padding:2px 8px}
.msg.error .bubble{color:var(--danger)}
.meta{font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:0 4px}
.tag{border:1px solid var(--line);border-radius:999px;padding:0 7px;font-size:11px;line-height:18px}

.chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 2px}
.chips p{width:100%;margin:2px 0 0;font-size:12px;color:var(--muted)}
.chip{border:1px solid var(--relay-brand);background:var(--paper);color:var(--ink);border-radius:999px;
  padding:6px 12px;font-size:13.5px;line-height:1.3;text-align:left}
.chip:hover{background:var(--bubble)}

.typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:var(--bubble);border-radius:16px;border-bottom-left-radius:6px}
.typing i{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:dot 1s infinite ease-in-out}
.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}
@keyframes dot{0%,80%,100%{opacity:.3;transform:none}40%{opacity:1;transform:translateY(-3px)}}

.foot{border-top:1px solid var(--line);padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:var(--paper)}
.compose{display:flex;gap:8px;align-items:flex-end}
.compose textarea{flex:1;resize:none;min-height:40px;max-height:120px;padding:9px 12px;border:1px solid #8f7c6b;border-radius:12px;background:#fff;line-height:1.4}
.compose textarea:disabled{background:var(--bubble);cursor:not-allowed}
.sendbtn{width:40px;height:40px;flex:none;border:0;border-radius:12px;background:var(--relay-brand);color:var(--relay-fg);display:grid;place-items:center}
.sendbtn:disabled{opacity:.45;cursor:not-allowed}
.sendbtn svg{width:18px;height:18px}
.row{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:var(--muted)}
.link{border:0;background:none;padding:4px 2px;color:var(--muted);text-decoration:underline;text-underline-offset:2px;font-size:12.5px}
.link:hover{color:var(--ink)}
.ended{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;font-size:14px}
.rating{display:flex;gap:8px}
.rating button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 14px;font-size:14px}
.rating button[aria-pressed="true"]{border-color:var(--relay-brand);background:var(--bubble)}
.primary{border:0;border-radius:10px;padding:8px 14px;background:var(--relay-brand);color:var(--relay-fg);font-weight:600}
.note{margin:0;font-size:12.5px;color:var(--muted);text-align:center}
.note.bad{color:var(--danger)}
.emailform{display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff;font-size:13.5px}
.emailform input{padding:8px 10px;border:1px solid #8f7c6b;border-radius:10px;background:#fff}
.emailform .note{text-align:left}
.emailform .row{justify-content:flex-end}

@media (max-width:480px){
  .root:not(.inline){bottom:12px;right:12px}
  .root.left:not(.inline){left:12px}
  .root:not(.inline) .panel{width:calc(100vw - 24px);height:calc(100vh - 92px)}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important}
}
`;

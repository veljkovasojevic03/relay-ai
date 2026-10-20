import { ApiError, type Api, type Source, type WidgetConfig } from "./api";
import { focusables, h, icon } from "./dom";
import { format, STRINGS, type ErrorKey, type Lang, type Strings } from "./i18n";
import { renderMarkdown } from "./markdown";
import { clearToken, loadToken, saveToken } from "./storage";
import { CSS } from "./styles";

export type WidgetOptions = {
  /** Null in the dashboard preview: nothing is ever sent. */
  api: Api | null;
  lang: Lang;
  /** Render in the page flow (dashboard preview) instead of fixed in a corner. */
  inline?: boolean;
};

type Role = "visitor" | "bot" | "human" | "system";

const MAX_CHARS = 500;
const LOW_REMAINING = 5;

/** Readable text color on the brand color (same rule as the dashboard's readableForeground). */
export function foregroundFor(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const onWhite = 1.05 / (l + 0.05);
  const onInk = (l + 0.05) / (0.0104 + 0.05);
  return onWhite >= onInk ? "#ffffff" : "#1f1a17";
}

const safeImageUrl = (raw: string | null) => {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
};

export class RelayWidget {
  private readonly doc: Document;
  private readonly t: Strings;
  private readonly root: HTMLDivElement;
  private readonly launcher: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly avatar: HTMLSpanElement;
  private readonly log: HTMLDivElement;
  private readonly live: HTMLDivElement;
  private readonly foot: HTMLDivElement;
  private readonly input: HTMLTextAreaElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly row: HTMLDivElement;
  private config: WidgetConfig;
  private token: string | null = null;
  private busy = false;
  private ended = false;
  private historyLoaded = false;
  private starterChips: HTMLElement | null = null;
  /** What the opening messages were last rendered from; unchanged drafts don't re-render. */
  private startKey = "";

  constructor(
    host: HTMLElement,
    config: WidgetConfig,
    private readonly options: WidgetOptions,
  ) {
    this.doc = host.ownerDocument;
    this.config = config;
    this.t = STRINGS[options.lang];
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const doc = this.doc;
    const t = this.t;

    const style = h(doc, "style", { text: CSS });
    this.title = h(doc, "h2");
    this.avatar = h(doc, "span", { class: "avatar", "aria-hidden": "true" });
    const minimize = h(
      doc,
      "button",
      { type: "button", class: "icon", "aria-label": t.close },
      icon(doc, options.inline ? "minimize" : "close"),
    );
    minimize.addEventListener("click", () => this.close());

    this.log = h(doc, "div", { class: "log" });
    this.live = h(doc, "div", { class: "sr", "aria-live": "polite", "aria-atomic": "true" });

    this.input = h(doc, "textarea", {
      rows: 1,
      maxlength: MAX_CHARS,
      "aria-label": t.placeholder,
      placeholder: options.api ? t.placeholder : t.preview,
      disabled: !options.api,
    });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void this.submit();
      }
    });
    this.input.addEventListener("input", () => this.autosize());

    this.sendButton = h(
      doc,
      "button",
      { type: "submit", class: "sendbtn", "aria-label": t.send, disabled: !options.api },
      icon(doc, "send"),
    );
    const compose = h(doc, "form", { class: "compose" }, this.input, this.sendButton);
    compose.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.submit();
    });
    this.row = h(doc, "div", { class: "row" });
    this.foot = h(doc, "div", { class: "foot" }, compose, this.row);

    this.panel = h(
      doc,
      "div",
      {
        class: "panel",
        id: "relay-panel",
        role: "dialog",
        "aria-modal": options.inline ? "false" : "true",
        hidden: !options.inline,
      },
      h(
        doc,
        "div",
        { class: "head" },
        this.avatar,
        h(doc, "div", { class: "who" }, this.title, h(doc, "p", { text: t.subtitle })),
        minimize,
      ),
      this.log,
      this.foot,
    );
    this.panel.addEventListener("keydown", (e) => this.onPanelKey(e));

    this.launcher = h(
      doc,
      "button",
      {
        type: "button",
        class: "launcher",
        "aria-label": t.open,
        "aria-controls": "relay-panel",
        "aria-expanded": options.inline ? "true" : "false",
      },
      icon(doc, "chat"),
    );
    this.launcher.addEventListener("click", () => (this.panel.hidden ? this.open() : this.close()));

    this.root = h(
      doc,
      "div",
      { class: "root", lang: options.lang },
      this.panel,
      this.launcher,
      this.live,
    );
    shadow.replaceChildren(style, this.root);

    if (options.api) this.token = loadToken(options.api.bot);
    // Also renders the greeting and quick questions.
    this.applyConfig(config);
  }

  /** Brand, name, logo, position and greeting; called again when the preview's draft changes. */
  applyConfig(config: WidgetConfig) {
    this.config = config;
    const brand = /^#[0-9a-f]{6}$/i.test(config.brandColor) ? config.brandColor : "#b3472b";
    this.root.style.setProperty("--relay-brand", brand);
    this.root.style.setProperty("--relay-fg", config.foreground || foregroundFor(brand));
    this.root.className = [
      "root",
      config.position === "left" ? "left" : "",
      this.options.inline ? "inline" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const name = config.name.trim() || "Relay";
    this.title.textContent = name;
    this.panel.setAttribute("aria-label", format(this.t.title, { name }));

    const logo = safeImageUrl(config.logoUrl);
    this.avatar.replaceChildren(
      logo
        ? h(this.doc, "img", { src: logo, alt: "", referrerpolicy: "no-referrer" })
        : (name[0] ?? "R").toUpperCase(),
    );
    const startKey = JSON.stringify([config.greeting, config.questions, config.available]);
    const untouched = this.log.querySelectorAll(".msg.visitor").length === 0;
    if (startKey !== this.startKey && !this.busy && untouched && !this.historyLoaded) {
      this.renderStart();
    }
  }

  open() {
    this.panel.hidden = false;
    this.launcher.setAttribute("aria-expanded", "true");
    if (!this.options.inline) this.launcher.setAttribute("aria-label", this.t.close);
    void this.loadHistory();
    if (!this.input.disabled) this.input.focus();
    this.scrollDown();
  }

  close() {
    if (this.options.inline) return;
    this.panel.hidden = true;
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.setAttribute("aria-label", this.t.open);
    this.launcher.focus();
  }

  private onPanelKey(e: KeyboardEvent) {
    if (this.options.inline) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key !== "Tab") return;
    // Focus trap: Tab cycles inside the open panel.
    const items = focusables(this.panel);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = (this.panel.getRootNode() as ShadowRoot).activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /** Greeting and the bot's quick questions, before anything was said. */
  private renderStart() {
    const lang = this.options.lang;
    this.startKey = JSON.stringify([
      this.config.greeting,
      this.config.questions,
      this.config.available,
    ]);
    this.log.replaceChildren();
    this.ended = false;
    const greeting = this.config.greeting[lang]?.trim() || this.t.greeting;
    this.addMessage("bot", greeting, { lang });

    if (!this.config.available && !this.token && this.options.api) {
      this.addMessage("system", this.t.errors.unavailable, { error: true });
      this.setComposerEnabled(false);
      this.renderRow();
      return;
    }
    const questions = this.config.questions.filter((q) => q.language === lang).map((q) => q.text);
    this.starterChips = questions.length ? this.chips(questions) : null;
    if (this.starterChips) this.log.appendChild(this.starterChips);
    this.setComposerEnabled(Boolean(this.options.api));
    this.renderRow();
  }

  private async loadHistory() {
    const api = this.options.api;
    if (!api || !this.token || this.historyLoaded) return;
    this.historyLoaded = true;
    try {
      const history = await api.history(this.token);
      if (history.messages.length === 0) return;
      this.log.replaceChildren();
      this.addMessage("bot", this.config.greeting[this.options.lang]?.trim() || this.t.greeting, {
        lang: this.options.lang,
      });
      for (const m of history.messages) {
        this.addMessage(m.role, m.text, { sources: m.sources, sample: m.mode === "sample" });
      }
      if (history.status === "resolved") this.renderEnded(history.rating);
      else this.renderRow(history.remainingMessages);
      this.scrollDown();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // The conversation is gone (deleted by the owner, or purged): start fresh.
        clearToken(api.bot);
        this.token = null;
      }
    }
  }

  private addMessage(
    role: Role,
    text: string,
    opts: { sources?: Source[]; sample?: boolean; lang?: Lang; error?: boolean } = {},
  ): { msg: HTMLDivElement; bubble: HTMLDivElement } {
    const bubble = h(this.doc, "div", { class: "bubble" });
    if (role === "visitor") bubble.textContent = text;
    else bubble.appendChild(renderMarkdown(this.doc, text));
    const msg = h(
      this.doc,
      "div",
      { class: `msg ${role}${opts.error ? " error" : ""}`, lang: opts.lang },
      bubble,
    );
    if (role === "bot") this.addMeta(msg, opts.sources ?? [], Boolean(opts.sample));
    this.log.appendChild(msg);
    this.scrollDown();
    return { msg, bubble };
  }

  private addMeta(msg: HTMLElement, sources: Source[], sample: boolean) {
    if (!sources.length && !sample) return;
    const meta = h(this.doc, "div", { class: "meta" });
    if (sources[0]) {
      meta.appendChild(
        h(this.doc, "span", {
          text: format(this.t.answeredFrom, { question: sources[0].question }),
        }),
      );
    }
    if (sample) {
      meta.appendChild(
        h(this.doc, "span", { class: "tag", title: this.t.sampleTitle, text: this.t.sample }),
      );
    }
    msg.appendChild(meta);
  }

  private chips(questions: string[], label?: string): HTMLElement {
    const box = h(this.doc, "div", {
      class: "chips",
      role: "group",
      "aria-label": label ?? this.t.suggestions,
    });
    if (label) box.appendChild(h(this.doc, "p", { text: label }));
    for (const q of questions) {
      const chip = h(this.doc, "button", {
        type: "button",
        class: "chip",
        text: q,
        disabled: !this.options.api,
      });
      chip.addEventListener("click", () => void this.submit(q));
      box.appendChild(chip);
    }
    return box;
  }

  private setComposerEnabled(enabled: boolean) {
    const on = enabled && Boolean(this.options.api) && !this.ended;
    this.input.disabled = !on;
    this.sendButton.disabled = !on;
  }

  private autosize() {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(this.input.scrollHeight, 120)}px`;
  }

  private scrollDown() {
    this.log.scrollTop = this.log.scrollHeight;
  }

  private announce(text: string) {
    this.live.textContent = "";
    // A fresh text node after clearing makes screen readers announce repeated messages too.
    setTimeout(() => (this.live.textContent = text), 50);
  }

  /** Footer line: remaining messages (when few) and "End chat". */
  private renderRow(remaining?: number) {
    this.row.replaceChildren();
    const left = h(this.doc, "span");
    if (remaining !== undefined && remaining <= LOW_REMAINING) {
      left.textContent = format(this.t.remaining, { count: remaining });
    }
    this.row.appendChild(left);
    if (this.token && !this.ended && this.options.api) {
      const end = h(this.doc, "button", { type: "button", class: "link", text: this.t.endChat });
      end.addEventListener("click", () => void this.endChat());
      this.row.appendChild(end);
    }
  }

  private async submit(preset?: string) {
    const api = this.options.api;
    const text = (preset ?? this.input.value).trim();
    if (!api || this.busy || this.ended || !text) return;
    if (text.length > MAX_CHARS) return this.showError("message_too_long");

    this.busy = true;
    this.setComposerEnabled(false);
    this.starterChips?.remove();
    this.starterChips = null;
    if (!preset) this.input.value = "";
    this.autosize();
    this.addMessage("visitor", text);
    await this.stream(api, text, true);
    this.busy = false;
    this.setComposerEnabled(true);
    if (!this.input.disabled) this.input.focus();
  }

  private async stream(api: Api, text: string, retryWithoutToken: boolean): Promise<void> {
    const typing = h(
      this.doc,
      "div",
      { class: "typing", "aria-hidden": "true" },
      h(this.doc, "i"),
      h(this.doc, "i"),
      h(this.doc, "i"),
    );
    this.log.appendChild(typing);
    this.scrollDown();

    let reply: { msg: HTMLDivElement; bubble: HTMLDivElement } | null = null;
    let replyText = "";
    let sources: Source[] = [];
    let sample = false;
    let language: Lang = this.options.lang;
    try {
      for await (const event of api.send(text, this.options.lang, this.token)) {
        switch (event.event) {
          case "meta":
            if (event.data.token) {
              this.token = event.data.token;
              saveToken(api.bot, event.data.token);
              this.historyLoaded = true;
            }
            sample = event.data.mode === "sample";
            language = event.data.language;
            break;
          case "delta":
            if (!reply) {
              typing.remove();
              reply = this.addMessage("bot", "", { lang: language });
            }
            replyText += event.data.text;
            // Plain text while streaming; formatted once complete.
            reply.bubble.textContent = replyText;
            this.scrollDown();
            break;
          case "sources":
            sources = event.data.faqs;
            break;
          case "done": {
            typing.remove();
            if (reply) {
              reply.bubble.replaceChildren(renderMarkdown(this.doc, replyText));
              this.addMeta(reply.msg, sources, sample);
              const label = sources[0]
                ? `. ${format(this.t.answeredFrom, { question: sources[0].question })}`
                : "";
              this.announce(`${replyText}${label}`);
            }
            if (event.data.suggestions.length) {
              this.log.appendChild(this.chips(event.data.suggestions, this.t.suggestions));
            }
            this.renderRow(event.data.remainingMessages);
            this.scrollDown();
            break;
          }
          case "error":
            typing.remove();
            this.showError("generic");
            break;
        }
      }
    } catch (error) {
      typing.remove();
      const code = error instanceof ApiError ? error.code : "generic";
      if (code === "invalid_token" && retryWithoutToken) {
        // The stored conversation no longer exists: continue in a new one.
        clearToken(api.bot);
        this.token = null;
        return this.stream(api, text, false);
      }
      if (code === "conversation_closed") {
        this.renderEnded(null);
        return;
      }
      this.showError(errorKeyFor(code));
    } finally {
      typing.remove();
    }
  }

  private showError(key: ErrorKey) {
    const text = this.t.errors[key];
    this.addMessage("system", text, { error: true });
    this.announce(text);
    if (key === "unavailable" || key === "message_cap_reached") {
      this.setComposerEnabled(false);
      if (key === "message_cap_reached") this.renderEnded(null, false);
    }
  }

  private async endChat() {
    const api = this.options.api;
    if (!api || !this.token) return;
    try {
      await api.end(this.token);
      this.renderEnded(null);
    } catch {
      this.showError("generic");
    }
  }

  /** Ended state: optional 👍/👎, then a way to start over. */
  private renderEnded(rating: "up" | "down" | null, askRating = true) {
    this.ended = true;
    this.setComposerEnabled(false);
    this.row.replaceChildren();
    const box = h(
      this.doc,
      "div",
      { class: "ended" },
      h(this.doc, "p", { class: "note", text: this.t.ended }),
    );
    if (askRating && this.token && this.options.api) {
      const api = this.options.api;
      const token = this.token;
      const thanks = h(this.doc, "p", { class: "note", role: "status" });
      const group = h(this.doc, "div", {
        class: "rating",
        role: "group",
        "aria-label": this.t.rate,
      });
      for (const [value, label, emoji] of [
        ["up", this.t.rateUp, "👍"],
        ["down", this.t.rateDown, "👎"],
      ] as const) {
        const button = h(
          this.doc,
          "button",
          {
            type: "button",
            "aria-pressed": rating === value ? "true" : "false",
            "aria-label": label,
          },
          emoji,
        );
        button.addEventListener("click", async () => {
          try {
            await api.rate(token, value);
            group
              .querySelectorAll("button")
              .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
            thanks.textContent = this.t.thanks;
          } catch {
            thanks.textContent = this.t.errors.generic;
          }
        });
        group.appendChild(button);
      }
      box.append(h(this.doc, "p", { class: "note", text: this.t.rate }), group, thanks);
    }
    const restart = h(this.doc, "button", {
      type: "button",
      class: "primary",
      text: this.t.newChat,
    });
    restart.addEventListener("click", () => this.newChat());
    box.appendChild(restart);
    this.row.appendChild(box);
  }

  private newChat() {
    if (this.options.api) clearToken(this.options.api.bot);
    this.token = null;
    this.historyLoaded = false;
    this.renderStart();
    this.input.focus();
  }
}

function errorKeyFor(code: string): ErrorKey {
  switch (code) {
    case "quota_exceeded":
    case "bot_inactive":
    case "not_configured":
    case "bot_daily_limit":
    case "bot_not_found":
    case "origin_not_allowed":
      return "unavailable";
    case "rate_limited":
    case "message_cap_reached":
    case "message_too_long":
    case "conversation_closed":
    case "network":
      return code;
    default:
      return "generic";
  }
}

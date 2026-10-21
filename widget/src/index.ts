import { Api, type WidgetConfig } from "./api";
import { pickLanguage, type Lang } from "./i18n";
import { foregroundFor, RelayWidget } from "./widget";

/**
 * Entry point of public/widget.js.
 *
 *   <script src="https://<app>/widget.js" data-bot="<public key>" async></script>
 *
 * Optional: data-lang="en|sr" forces the widget language (otherwise <html lang>, then the
 * browser). The dashboard uses window.RelayAI.preview() instead of a script tag.
 *
 * The host page may call window.RelayAI.ask("question") (e.g. from a "Help" link): it opens
 * the chat and sends the question. Returns false while no widget is mounted yet.
 */

declare global {
  interface Window {
    RelayAI?: {
      preview: (container: HTMLElement, settings: PreviewSettings) => PreviewHandle;
      ask: (text: string, bot?: string) => boolean;
      mounted: Set<string>;
    };
  }
}

export type PreviewSettings = Omit<WidgetConfig, "foreground" | "available" | "mode"> & {
  lang: Lang;
};
export type PreviewHandle = { update: (settings: PreviewSettings) => void; destroy: () => void };

const TAG = "relay-ai-widget";

/**
 * The host element is the one node the page's CSS can still reach. Inline !important
 * declarations outrank any stylesheet rule, so host styles can't hide, move or restyle it,
 * and `all: initial` stops inherited fonts and colors at the shadow boundary.
 */
function createHost(doc: Document): HTMLElement {
  const host = doc.createElement(TAG);
  host.style.cssText =
    "all:initial!important;display:block!important;position:static!important;" +
    "visibility:visible!important;opacity:1!important;contain:style!important";
  return host;
}

const toConfig = (s: PreviewSettings): WidgetConfig => ({
  ...s,
  foreground: foregroundFor(s.brandColor),
  available: true,
  mode: "sample",
});

/** Widgets mounted from script tags, by bot key (previews aren't listed). */
const widgets = new Map<string, RelayWidget>();

const api: NonNullable<Window["RelayAI"]> = window.RelayAI ?? {
  mounted: new Set(),
  ask(text, bot) {
    const widget = bot ? widgets.get(bot) : widgets.values().next().value;
    if (!widget || typeof text !== "string" || !text.trim()) return false;
    void widget.ask(text);
    return true;
  },
  preview(container, settings) {
    let widget = new RelayWidget(container, toConfig(settings), {
      api: null,
      lang: settings.lang,
      inline: true,
    });
    let lang = settings.lang;
    return {
      update(next) {
        if (next.lang !== lang) {
          // Language changes every string: rebuild.
          lang = next.lang;
          widget = new RelayWidget(container, toConfig(next), {
            api: null,
            lang: next.lang,
            inline: true,
          });
        } else {
          widget.applyConfig(toConfig(next));
        }
      },
      destroy() {
        container.shadowRoot?.replaceChildren();
      },
    };
  },
};
window.RelayAI = api;

async function boot(script: HTMLScriptElement) {
  const bot = script.dataset.bot;
  if (!bot || !/^[A-Za-z0-9_-]{16,64}$/.test(bot)) {
    console.warn("Relay AI: the script tag needs a valid data-bot attribute.");
    return;
  }
  // One widget per bot, even if the snippet was pasted twice.
  if (api.mounted.has(bot)) return;
  api.mounted.add(bot);

  const client = new Api(new URL(script.src).origin, bot);
  let config: WidgetConfig;
  try {
    config = await client.config();
  } catch {
    // Unknown bot, a website not on the bot's list, or the service is down: show nothing.
    console.warn(
      "Relay AI: the chat couldn't load. Check that this website is in the bot's allowed websites.",
    );
    api.mounted.delete(bot);
    return;
  }

  const host = createHost(document);
  document.body.appendChild(host);
  widgets.set(
    bot,
    new RelayWidget(host, config, {
      api: client,
      lang: pickLanguage(script.dataset.lang ?? null, config.defaultLanguage),
    }),
  );
}

const script = document.currentScript;
if (script instanceof HTMLScriptElement && script.dataset.bot !== undefined) {
  if (document.body) void boot(script);
  else document.addEventListener("DOMContentLoaded", () => void boot(script), { once: true });
}

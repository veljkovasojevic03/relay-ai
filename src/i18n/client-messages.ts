import type { AbstractIntlMessages } from "next-intl";

/**
 * Message namespaces client components on public pages need (landing, demo, sandbox, auth).
 * The root layout sends only these to the browser; the dashboard layout adds the rest.
 * Without this, every public page carried the whole catalog (~37 KB of dashboard copy).
 */
export const PUBLIC_CLIENT_MESSAGES = [
  "Header",
  "Locale",
  "Errors",
  "Auth",
  "Sandbox",
  "Demo",
  "PageError",
] as const;

/** Copies the given top-level namespaces or dotted sub-paths out of a catalog. */
export function pickMessages(
  messages: AbstractIntlMessages,
  paths: readonly string[],
): AbstractIntlMessages {
  const out: AbstractIntlMessages = {};
  for (const path of paths) {
    const keys = path.split(".");
    let source: unknown = messages;
    for (const key of keys) source = (source as Record<string, unknown> | undefined)?.[key];
    if (source === undefined) continue;
    let target = out;
    for (const key of keys.slice(0, -1)) {
      target[key] ??= {};
      target = target[key] as AbstractIntlMessages;
    }
    target[keys.at(-1)!] = source as AbstractIntlMessages;
  }
  return out;
}

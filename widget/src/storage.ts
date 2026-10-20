/**
 * The visitor's own conversation token, per bot, in localStorage (spec §4.5, §5.11): the only
 * thing the widget stores. Storage can be blocked (private mode, strict settings); then the
 * chat simply doesn't survive a refresh.
 */

const key = (bot: string) => `relay-ai:v1:${bot}:token`;

export function loadToken(bot: string): string | null {
  try {
    const token = localStorage.getItem(key(bot));
    return token && /^[A-Za-z0-9_-]{22}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function saveToken(bot: string, token: string) {
  try {
    localStorage.setItem(key(bot), token);
  } catch {
    // Storage unavailable: the conversation still works until the page closes.
  }
}

export function clearToken(bot: string) {
  try {
    localStorage.removeItem(key(bot));
  } catch {
    // Nothing stored, nothing to clear.
  }
}

import type { Lang } from "./i18n";

/** Client for the public widget API (src/app/api/widget). Same shapes as the server. */

export type WidgetConfig = {
  name: string;
  brandColor: string;
  foreground: string;
  logoUrl: string | null;
  greeting: Partial<Record<Lang, string>>;
  position: "left" | "right";
  questions: { language: Lang; text: string }[];
  defaultLanguage: Lang;
  available: boolean;
  mode: "sample" | "live";
  /** Public Supabase URL + browser-safe key for "reply waiting" pings; null = polling only. */
  realtime?: { url: string; key: string } | null;
};

export type Status = "bot" | "waiting_human" | "human" | "resolved";

export type Source = { id: string; question: string };

export type HistoryMessage = {
  id: string;
  role: "visitor" | "bot" | "human" | "system";
  text: string;
  sources: Source[];
  mode: "sample" | "live" | null;
  createdAt: string;
};

export type History = {
  status: Status;
  rating: "up" | "down" | null;
  channel: string;
  hasEmail: boolean;
  remainingMessages: number;
  messages: HistoryMessage[];
};

export type StreamEvent =
  | {
      event: "meta";
      data: { token?: string; channel?: string; mode: "sample" | "live"; language: Lang };
    }
  | { event: "delta"; data: { text: string } }
  | { event: "sources"; data: { faqs: Source[] } }
  | {
      event: "handoff";
      data: { reason: string; status: "waiting_human"; message: string; messageId: string | null };
    }
  | {
      event: "done";
      data: {
        outcome: "answered" | "unknown" | "degraded" | "waiting" | "handoff";
        offerHuman: boolean;
        suggestions: string[];
        remainingMessages: number;
      };
    }
  | { event: "error"; data: { code: string } };

/** A request the API refused (JSON error body) or that never reached it. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export class Api {
  constructor(
    private readonly base: string,
    readonly bot: string,
  ) {}

  private url(path: string, query: Record<string, string> = {}) {
    const url = new URL(`/api/widget/${path}`, this.base);
    url.searchParams.set("bot", this.bot);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url.href;
  }

  private async request(path: string, init: RequestInit, token?: string | null) {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (token) headers["X-Relay-Token"] = token;
    let response: Response;
    try {
      // No cookies: the widget is anonymous, and credentials would widen the CORS surface.
      response = await fetch(path, { ...init, headers, credentials: "omit", mode: "cors" });
    } catch {
      throw new ApiError("network", 0);
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new ApiError(body?.error ?? "generic", response.status);
    }
    return response;
  }

  async config(): Promise<WidgetConfig> {
    return (await this.request(this.url("config"), { method: "GET" })).json();
  }

  async history(token: string): Promise<History> {
    return (await this.request(this.url("conversation"), { method: "GET" }, token)).json();
  }

  private post(path: string, body: Record<string, unknown>, token?: string | null) {
    return this.request(
      this.url(path),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot: this.bot, ...body }),
      },
      token,
    );
  }

  /** New human/system messages since `since` (ISO), plus the current status. */
  async poll(
    token: string,
    since: string | null,
  ): Promise<{
    status: Status;
    messages: { id: string; role: "human" | "system"; text: string; createdAt: string }[];
  }> {
    const url = this.url("poll", since ? { since } : {});
    return (await this.request(url, { method: "GET" }, token)).json();
  }

  /** "Talk to a person", or the optional email afterwards. */
  async handoff(
    token: string,
    email?: string,
  ): Promise<{
    status: Status;
    message: string | null;
    messageId: string | null;
    hasEmail: boolean;
  }> {
    return (await this.post("handoff", email ? { email } : {}, token)).json();
  }

  async rate(token: string, rating: "up" | "down") {
    await this.post("rate", { rating }, token);
  }

  async end(token: string) {
    await this.post("end", {}, token);
  }

  /** Sends a message and yields the reply's events as they arrive. */
  async *send(text: string, locale: Lang, token: string | null): AsyncGenerator<StreamEvent> {
    const response = await this.post("message", { text, locale }, token);
    const reader = response.body?.getReader();
    if (!reader) throw new ApiError("generic", response.status);
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = parseFrame(frame);
        if (event) yield event;
      }
      if (done) return;
    }
  }
}

/** One SSE frame → event, or null for anything unexpected (ignored, never executed). */
export function parseFrame(frame: string): StreamEvent | null {
  let event = "";
  let data = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7);
    else if (line.startsWith("data: ")) data += line.slice(6);
  }
  if (!event || !data) return null;
  try {
    return { event, data: JSON.parse(data) } as StreamEvent;
  } catch {
    return null;
  }
}

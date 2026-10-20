/**
 * Minimal Supabase Realtime client (Phoenix protocol, vsn 1.0.0): join one public Broadcast
 * channel, keep the socket alive, reconnect with backoff. supabase-js is far too big for the
 * widget's budget, and this is all the widget needs.
 *
 * Messages on the channel are content-free pings ("this conversation changed"); the widget
 * answers them by polling the token-protected API, so nothing received here is ever shown.
 */

const HEARTBEAT_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

export type LiveState = "connecting" | "joined" | "closed";

export class LiveChannel {
  private socket: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private ref = 0;
  private joinRef = "";
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly key: string,
    private readonly channel: string,
    private readonly onPing: () => void,
    private readonly onState: (state: LiveState) => void,
  ) {}

  /** ws(s)://<project>/realtime/v1/websocket?apikey=…&vsn=1.0.0 */
  static socketUrl(base: string, key: string): string | null {
    try {
      const url = new URL("/realtime/v1/websocket", base);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("apikey", key);
      url.searchParams.set("vsn", "1.0.0");
      return url.href;
    } catch {
      return null;
    }
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearInterval(this.heartbeat);
    clearTimeout(this.retry);
    this.socket?.close();
    this.socket = null;
    this.onState("closed");
  }

  private send(topic: string, event: string, payload: object, joinRef: string | null = null) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.ref += 1;
    this.socket.send(
      JSON.stringify({ topic, event, payload, ref: String(this.ref), join_ref: joinRef }),
    );
  }

  private connect() {
    const url = LiveChannel.socketUrl(this.url, this.key);
    if (!url || typeof WebSocket === "undefined") return this.onState("closed");
    this.onState("connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      return this.scheduleReconnect();
    }
    this.socket = socket;
    const topic = `realtime:${this.channel}`;

    socket.onopen = () => {
      this.joinRef = String(this.ref + 1);
      this.send(
        topic,
        "phx_join",
        {
          config: {
            broadcast: { self: false, ack: false },
            presence: { key: "" },
            postgres_changes: [],
            private: false,
          },
        },
        this.joinRef,
      );
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => this.send("phoenix", "heartbeat", {}), HEARTBEAT_MS);
    };

    socket.onmessage = (event) => {
      let msg: { topic?: string; event?: string; ref?: string; payload?: { status?: string } };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.topic !== topic) return;
      if (msg.event === "phx_reply" && msg.ref === this.joinRef) {
        if (msg.payload?.status === "ok") {
          this.attempts = 0;
          this.onState("joined");
          // Anything that happened while we were connecting is fetched now.
          this.onPing();
        } else {
          socket.close();
        }
      } else if (msg.event === "broadcast") {
        this.onPing();
      } else if (msg.event === "phx_close" || msg.event === "phx_error") {
        socket.close();
      }
    };

    socket.onclose = () => {
      clearInterval(this.heartbeat);
      if (this.socket === socket) this.socket = null;
      if (!this.stopped) this.scheduleReconnect();
    };
    socket.onerror = () => socket.close();
  }

  private scheduleReconnect() {
    this.onState("connecting");
    clearTimeout(this.retry);
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempts);
    this.attempts += 1;
    this.retry = setTimeout(() => this.connect(), delay);
  }
}

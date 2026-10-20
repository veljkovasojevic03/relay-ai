import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveChannel, type LiveState } from "./realtime";

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: { topic: string; event: string; payload: unknown; ref: string; join_ref: string | null }[] =
    [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  receive(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const TOPIC = "realtime:0123456789abcdef0123456789abcdef";

describe("LiveChannel", () => {
  let pings: number;
  let states: LiveState[];
  let channel: LiveChannel;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    pings = 0;
    states = [];
    channel = new LiveChannel(
      "https://abc.supabase.co",
      "sb_publishable_x",
      "0123456789abcdef0123456789abcdef",
      () => pings++,
      (s) => states.push(s),
    );
  });

  afterEach(() => {
    channel.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("builds the socket URL from the project URL and the publishable key", () => {
    expect(LiveChannel.socketUrl("https://abc.supabase.co", "k")).toBe(
      "wss://abc.supabase.co/realtime/v1/websocket?apikey=k&vsn=1.0.0",
    );
    expect(LiveChannel.socketUrl("http://127.0.0.1:54321", "k")).toBe(
      "ws://127.0.0.1:54321/realtime/v1/websocket?apikey=k&vsn=1.0.0",
    );
  });

  it("joins the public channel, pings on join and on each broadcast, ignores other topics", () => {
    channel.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    const join = socket.sent[0]!;
    expect(join).toMatchObject({ topic: TOPIC, event: "phx_join" });
    expect(join.payload).toMatchObject({ config: { private: false, broadcast: { self: false } } });

    socket.receive({ topic: TOPIC, event: "phx_reply", ref: join.ref, payload: { status: "ok" } });
    expect(states.at(-1)).toBe("joined");
    expect(pings).toBe(1);

    socket.receive({ topic: TOPIC, event: "broadcast", payload: { event: "update" } });
    socket.receive({ topic: "realtime:other", event: "broadcast", payload: {} });
    socket.onmessage?.({ data: "not json" });
    expect(pings).toBe(2);
  });

  it("sends a heartbeat every 25 seconds", () => {
    channel.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    vi.advanceTimersByTime(50_000);
    expect(
      socket.sent.filter((m) => m.topic === "phoenix" && m.event === "heartbeat"),
    ).toHaveLength(2);
  });

  it("reconnects with growing backoff after the socket drops, and stops for good on stop()", () => {
    channel.start();
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.close();
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1]!.close();
    vi.advanceTimersByTime(1999);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(3);

    channel.stop();
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(3);
    expect(states.at(-1)).toBe("closed");
  });

  it("treats a refused join as a dropped connection", () => {
    channel.start();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    socket.receive({
      topic: TOPIC,
      event: "phx_reply",
      ref: socket.sent[0]!.ref,
      payload: { status: "error" },
    });
    expect(socket.readyState).toBe(3);
    expect(pings).toBe(0);
  });
});

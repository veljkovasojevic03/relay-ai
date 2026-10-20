import { handleMessage, type MessageDeps } from "@/lib/widget/message";

import { adminClient, axisVector, createBot, type TestUser } from "./helpers";

// The embed Edge Function isn't part of the test stack: queries get fixed unit vectors,
// so similarity is exact (same axis = 1, different axis = 0).
export type Embed = MessageDeps["embed"];
export const axis = (i: number) => JSON.parse(axisVector(i)) as number[];
export const embedAs =
  (i: number | null): Embed =>
  async () =>
    i === null ? null : axis(i);

export const SHOP = "https://shop.example";
export const db = () => adminClient();

export function deps(embed: Embed = embedAs(0)): MessageDeps {
  return { db: db(), embed, sleep: async () => {}, now: () => performance.now() };
}

// Test-side view of the protocol: loose on purpose, assertions pin the shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
export type Sent = {
  status: number;
  headers: Headers;
  events: { event: string; data: Loose }[];
  json?: Loose;
};

export async function send(
  bot: string,
  text: string,
  opts: { token?: string; origin?: string; ip?: string; embed?: Embed; locale?: string } = {},
): Promise<Sent> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["X-Relay-Token"] = opts.token;
  if (opts.origin) headers.Origin = opts.origin;
  headers["X-Forwarded-For"] = opts.ip ?? `10.${Math.floor(Math.random() * 250)}.0.1`;
  const response = await handleMessage(
    new Request("https://relay.test/api/widget/message", {
      method: "POST",
      headers,
      body: JSON.stringify({ bot, text, locale: opts.locale }),
    }),
    deps(opts.embed),
  );
  const body = await response.text();
  if (!response.headers.get("content-type")?.startsWith("text/event-stream")) {
    return {
      status: response.status,
      headers: response.headers,
      events: [],
      json: JSON.parse(body),
    };
  }
  const events = body
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => {
      const [eventLine, dataLine] = frame.split("\n");
      return { event: eventLine!.slice(7), data: JSON.parse(dataLine!.slice(6)) };
    });
  return { status: response.status, headers: response.headers, events };
}

export const tokenOf = (sent: Sent) => sent.events[0]!.data.token as string;
export const replyText = (sent: Sent) =>
  sent.events
    .filter((e) => e.event === "delta")
    .map((e) => e.data.text)
    .join("");

export async function setupBot(owner: TestUser) {
  const bot = await createBot(owner, "Widget bot");
  await owner.client
    .from("bots")
    .update({ allowed_origins: [SHOP] })
    .eq("id", bot.id);
  const faqs = [
    { axis: 0, question: "How long does shipping take?", answer: "1–3 working days." },
    { axis: 1, question: "Can I return shoes?", answer: "Yes, within 14 days." },
  ];
  for (const f of faqs) {
    const { data, error } = await owner.client
      .from("faqs")
      .insert({ bot_id: bot.id, question: f.question, answer: f.answer, language: "en" })
      .select("id")
      .single();
    if (error) throw error;
    await db()
      .from("faqs")
      .update({ embedding: axisVector(f.axis), embedding_status: "ready" })
      .eq("id", data.id);
  }
  return { id: bot.id as string, key: bot.public_key as string };
}

export async function conversationOf(token: string) {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(token).digest("hex");
  const { data } = await db().from("conversations").select("*").eq("token_hash", hash).single();
  return data!;
}

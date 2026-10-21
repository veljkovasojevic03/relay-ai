import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { KROJ_FAQS, type Lang } from "./kroj";

/**
 * Plausible conversation history for one bot, so Analytics has something to show: daily
 * chats, some handed to the owner, ratings, first-response times, and unknown questions
 * (a few asked repeatedly, some answered by the owner). Used by `pnpm demo:seed-analytics`
 * and by every new sandbox. Deterministic for a given seed.
 *
 * Seeded rows are marked with `ip_hash = SEED_MARK`, so they can be removed again.
 */

export const SEED_MARK = "seed:analytics";

/** Small deterministic PRNG (mulberry32), so a seed always produces the same history. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Questions the bot answered: the featured entries of the Kroj FAQ set. */
const ANSWERED: Record<Lang, [string, string][]> = {
  en: answered("en"),
  sr: answered("sr"),
};

function answered(language: Lang): [string, string][] {
  return KROJ_FAQS.filter((f) => f.language === language && f.featured).map((f) => [
    f.question,
    f.answer,
  ]);
}

/** Questions the bot doesn't know; some get a human reply that becomes the FAQ draft. */
const UNKNOWN: Record<Lang, { q: string; reply: string | null; weight: number }[]> = {
  en: [
    {
      q: "Do you have sneakers in size 52?",
      reply: "Not at the moment, but size 50–52 arrives next month.",
      weight: 4,
    },
    { q: "Can I pay with crypto?", reply: null, weight: 2 },
    {
      q: "Do you do gift wrapping?",
      reply: "Yes! Add a note at checkout and we'll wrap it for free.",
      weight: 2,
    },
    { q: "Is there a student discount?", reply: null, weight: 1 },
  ],
  sr: [
    {
      q: "Da li imate patike broj 52?",
      reply: "Trenutno nemamo, ali brojevi 50–52 stižu sledećeg meseca.",
      weight: 3,
    },
    {
      q: "Da li radite nedeljom?",
      reply: "Online prodavnica radi stalno, a radnja je nedeljom zatvorena.",
      weight: 2,
    },
    { q: "Imate li popust za studente?", reply: null, weight: 1 },
  ],
};

const UNKNOWN_REPLY: Record<Lang, string> = {
  en: "I'm not sure about that one, and I'd rather not guess. Would you like to talk to a person?",
  sr: "Nisam siguran za to i ne bih da nagađam. Želiš li da razgovaraš sa osobom?",
};

function pick<T>(random: () => number, items: T[], weight?: (t: T) => number): T {
  if (!weight) return items[Math.floor(random() * items.length)]!;
  const total = items.reduce((sum, t) => sum + weight(t), 0);
  let r = random() * total;
  for (const t of items) {
    r -= weight(t);
    if (r < 0) return t;
  }
  return items[items.length - 1]!;
}

const at = (base: Date, minutes: number) =>
  new Date(base.getTime() + minutes * 60_000).toISOString();

export async function seedAnalytics(
  db: SupabaseClient,
  botId: string,
  options: { days?: number; seed?: number; now?: Date } = {},
): Promise<{ conversations: number; unknown: number; humanReplies: number }> {
  const days = options.days ?? 30;
  const random = prng(options.seed ?? 42);
  const now = options.now ?? new Date();

  const conversations: Record<string, unknown>[] = [];
  const messages: Record<string, unknown>[] = [];
  const unknown: Record<string, unknown>[] = [];
  const humanReplies: Record<string, unknown>[] = [];

  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(now.getTime() - d * 86_400_000);
    const weekend = [0, 6].includes(day.getUTCDay());
    // A slowly growing shop: more chats toward today, fewer on weekends.
    const count = Math.round((2 + (6 * (days - d)) / days) * (weekend ? 0.6 : 1) + random() * 3);

    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      const language: Lang = random() < 0.6 ? "en" : "sr";
      const start = new Date(day);
      start.setUTCHours(8 + Math.floor(random() * 13), Math.floor(random() * 60), 0, 0);
      if (start > now) start.setTime(now.getTime() - 60 * 60_000 * (1 + random() * 3));

      const askedUnknown = random() < 0.22;
      const handedOff = askedUnknown ? random() < 0.65 : random() < 0.06;
      const recent = now.getTime() - start.getTime() < 2 * 86_400_000;
      const rating = random() < 0.4 ? (random() < (handedOff ? 0.7 : 0.85) ? "up" : "down") : null;

      conversations.push({
        id,
        bot_id: botId,
        created_at: start.toISOString(),
        token_hash: createHash("sha256").update(randomBytes(16)).digest("hex"),
        realtime_channel: randomBytes(24).toString("base64url"),
        status: handedOff ? (recent ? "human" : "resolved") : "resolved",
        language,
        ip_hash: SEED_MARK,
        visitor_message_count: 2,
        rating,
        first_response_ms: Math.round(350 + random() * 1800),
        handed_off_at: handedOff ? at(start, 2) : null,
        last_visitor_activity_at: at(start, 3),
        resolved_by: handedOff ? (recent ? null : "human") : random() < 0.5 ? "visitor" : "bot",
        mode: "sample",
      });

      const msg = (minutes: number, role: string, content: string) =>
        messages.push({
          conversation_id: id,
          bot_id: botId,
          role,
          content,
          created_at: at(start, minutes),
          meta: role === "bot" ? { mode: "sample" } : {},
        });

      const [q, a] = pick(random, ANSWERED[language]);
      msg(0, "visitor", q);
      msg(0.1, "bot", a);

      if (askedUnknown) {
        const u = pick(random, UNKNOWN[language], (x) => x.weight);
        msg(1, "visitor", u.q);
        msg(1.1, "bot", UNKNOWN_REPLY[language]);
        unknown.push({
          bot_id: botId,
          conversation_id: id,
          question: u.q,
          language,
          created_at: at(start, 1.1),
        });
        if (handedOff && u.reply) {
          humanReplies.push({
            conversation_id: id,
            bot_id: botId,
            role: "human",
            content: u.reply,
            created_at: at(start, 6 + random() * 60),
          });
        }
      }
    }
  }

  // Order matters: unknown questions exist before the human replies, so the database
  // trigger turns each first reply into the question's suggested answer.
  await insertAll(db, "conversations", conversations);
  await insertAll(db, "messages", messages);
  await insertAll(db, "unknown_questions", unknown);
  await insertAll(db, "messages", humanReplies);
  return {
    conversations: conversations.length,
    unknown: unknown.length,
    humanReplies: humanReplies.length,
  };
}

async function insertAll(db: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).insert(rows.slice(i, i + 500));
    if (error)
      throw new Error(`seed insert into ${table} failed (${error.code}: ${error.message})`);
  }
}

/** Removes everything seedAnalytics added to this bot (messages and questions cascade). */
export async function clearSeededAnalytics(db: SupabaseClient, botId: string): Promise<number> {
  const { data, error } = await db
    .from("conversations")
    .delete()
    .eq("bot_id", botId)
    .eq("ip_hash", SEED_MARK)
    .select("id");
  if (error) throw new Error(`seed clear failed (${error.code})`);
  return data.length;
}

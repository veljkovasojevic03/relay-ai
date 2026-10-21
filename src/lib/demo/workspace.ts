import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { BOT_COPY } from "@/lib/widget/copy";

import { KROJ_BOT, KROJ_FAQS, type Lang } from "./kroj";

/**
 * Builds a Kroj workspace with the service role: the bot, its FAQ set and its actions. Used
 * by `pnpm demo:seed` (the demo store's bot) and by every new sandbox. No `server-only`
 * import, so the seed script can use it too. Callers decide who owns the bot.
 */

type Db = SupabaseClient;

const faqKey = (language: string, question: string) => `${language}\n${question}`;

export async function createKrojBot(
  db: Db,
  options: { ownerId: string; publicKey?: string; defaultLanguage: Lang; isDemo: boolean },
): Promise<string> {
  const { data, error } = await db
    .from("bots")
    .insert({
      owner_id: options.ownerId,
      ...(options.publicKey ? { public_key: options.publicKey } : {}),
      ...krojBotSettings(options.defaultLanguage),
      is_demo: options.isDemo,
    })
    .select("id")
    .single();
  if (error) throw new Error(`bot insert failed (${error.code}: ${error.message})`);
  await enableActions(db, data.id);
  return data.id;
}

export function krojBotSettings(defaultLanguage: Lang) {
  return {
    name: KROJ_BOT.name,
    description: KROJ_BOT.description,
    default_language: defaultLanguage,
    brand_color: KROJ_BOT.brandColor,
    greeting: KROJ_BOT.greeting,
    featured_questions: KROJ_BOT.featuredQuestions,
    position: "right",
    active: true,
  };
}

/** Switches on both registry actions (`order_status` works only on `is_demo` bots). */
export async function enableActions(db: Db, botId: string) {
  const { data: actions, error } = await db
    .from("actions")
    .select("id")
    .in("name", ["order_status", "create_ticket"]);
  if (error) throw new Error(`actions lookup failed (${error.code})`);
  const { error: upsertError } = await db.from("bot_actions").upsert(
    actions.map((a) => ({ bot_id: botId, action_id: a.id, enabled: true })),
    { onConflict: "bot_id,action_id" },
  );
  if (upsertError) throw new Error(`bot_actions upsert failed (${upsertError.code})`);
}

/**
 * Replaces the bot's FAQs with the Kroj set. Vectors are copied from `embeddingsFrom` (the
 * demo bot, already indexed) where the same question exists there, so a new sandbox needs
 * no embedding call. Returns the ids still waiting for a vector.
 */
export async function replaceKrojFaqs(
  db: Db,
  botId: string,
  embeddingsFrom?: string | null,
): Promise<string[]> {
  const vectors = new Map<string, string>();
  if (embeddingsFrom) {
    const { data, error } = await db
      .from("faqs")
      .select("question, language, embedding")
      .eq("bot_id", embeddingsFrom)
      .eq("embedding_status", "ready");
    if (error) throw new Error(`faq vectors lookup failed (${error.code})`);
    for (const row of data as { question: string; language: string; embedding: string }[]) {
      if (row.embedding) vectors.set(faqKey(row.language, row.question), row.embedding);
    }
  }

  const { error: deleteError } = await db.from("faqs").delete().eq("bot_id", botId);
  if (deleteError) throw new Error(`faq delete failed (${deleteError.code})`);

  const { data, error } = await db
    .from("faqs")
    .insert(
      KROJ_FAQS.map((faq) => {
        const embedding = vectors.get(faqKey(faq.language, faq.question));
        return {
          bot_id: botId,
          question: faq.question,
          answer: faq.answer,
          language: faq.language,
          featured: faq.featured,
          embedding: embedding ?? null,
          embedding_status: embedding ? "ready" : "pending",
        };
      }),
    )
    .select("id, embedding_status");
  if (error) throw new Error(`faq insert failed (${error.code}: ${error.message})`);
  return data.filter((f) => f.embedding_status !== "ready").map((f) => f.id);
}

/**
 * Two chats waiting in the inbox: one handed to the owner a few minutes ago (with the
 * visitor's email), one the owner already answered where the visitor wrote back. Both
 * unread, so a sandbox opens with something to do.
 */
export async function seedInbox(db: Db, botId: string, options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
  const shop = KROJ_BOT.name;

  const chats: {
    language: Lang;
    startedMinutesAgo: number;
    status: "waiting_human" | "human";
    email: string | null;
    messages: { role: "visitor" | "bot" | "system" | "human"; content: string; at: number }[];
  }[] = [
    {
      language: "en",
      startedMinutesAgo: 14,
      status: "waiting_human",
      email: "milica@example.com",
      messages: [
        { role: "visitor", content: "Do you have the Trk sneakers in size 47?", at: 14 },
        { role: "bot", content: BOT_COPY.en.unknown, at: 14 },
        { role: "visitor", content: "Yes, please, I'd like to talk to a person.", at: 13 },
        { role: "system", content: BOT_COPY.en.handoff(shop), at: 13 },
      ],
    },
    {
      language: "sr",
      startedMinutesAgo: 95,
      status: "human",
      email: null,
      messages: [
        { role: "visitor", content: "Mogu li da preuzmem porudžbinu u radnji?", at: 95 },
        { role: "bot", content: BOT_COPY.sr.unknown, at: 95 },
        { role: "visitor", content: "Može, hvala.", at: 94 },
        { role: "system", content: BOT_COPY.sr.handoff(shop), at: 94 },
        {
          role: "human",
          content:
            "Može! Izaberi „Preuzimanje u radnji“ pri plaćanju i javićemo ti kad je spremno.",
          at: 80,
        },
        { role: "visitor", content: "Super. Koliko dugo čuvate paket?", at: 6 },
      ],
    },
  ];

  for (const chat of chats) {
    const id = randomUUID();
    const lastVisitor = Math.min(
      ...chat.messages.filter((m) => m.role === "visitor").map((m) => m.at),
    );
    const { error } = await db.from("conversations").insert({
      id,
      bot_id: botId,
      created_at: ago(chat.startedMinutesAgo),
      token_hash: createHash("sha256").update(randomBytes(16)).digest("hex"),
      realtime_channel: randomBytes(24).toString("base64url"),
      status: chat.status,
      language: chat.language,
      visitor_email: chat.email,
      visitor_message_count: chat.messages.filter((m) => m.role === "visitor").length,
      unknown_streak: 0,
      first_response_ms: 600,
      handed_off_at: ago(chat.messages.find((m) => m.role === "system")!.at),
      last_visitor_activity_at: ago(lastVisitor),
      owner_unread: true,
      mode: "sample",
    });
    if (error) throw new Error(`inbox seed failed (${error.code}: ${error.message})`);

    // The first question was one the bot couldn't answer. Written before the messages, so
    // the owner's reply becomes its suggested answer (database trigger).
    const { error: unknownError } = await db.from("unknown_questions").insert({
      bot_id: botId,
      conversation_id: id,
      question: chat.messages[0]!.content,
      language: chat.language,
      created_at: ago(chat.startedMinutesAgo),
    });
    if (unknownError) throw new Error(`inbox unknown seed failed (${unknownError.code})`);

    // One row at a time, oldest first: the last-message trigger keeps the newest preview.
    for (const m of chat.messages.toSorted((a, b) => b.at - a.at)) {
      const { error: messageError } = await db.from("messages").insert({
        conversation_id: id,
        bot_id: botId,
        role: m.role,
        content: m.content,
        created_at: ago(m.at),
        meta:
          m.role === "bot"
            ? { mode: "sample" }
            : m.role === "system"
              ? { kind: "handoff", reason: "requested" }
              : {},
      });
      if (messageError) throw new Error(`inbox message seed failed (${messageError.code})`);
    }
  }
}

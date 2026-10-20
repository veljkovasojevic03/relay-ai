import "server-only";

import { cache } from "react";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The owner's inbox, read through RLS: an owner only ever sees their own bots' chats. */

export type ConversationStatus = "bot" | "waiting_human" | "human" | "resolved";
export const INBOX_FILTERS = ["all", "waiting_human", "human", "bot", "resolved"] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const parseFilter = (value: unknown): InboxFilter =>
  INBOX_FILTERS.includes(value as InboxFilter) ? (value as InboxFilter) : "all";

export type ConversationSummary = {
  id: string;
  botName: string;
  status: ConversationStatus;
  language: "en" | "sr";
  unread: boolean;
  visitorEmail: string | null;
  preview: string | null;
  previewRole: "visitor" | "bot" | "human" | "system" | null;
  lastMessageAt: string;
};

type SummaryRow = {
  id: string;
  status: ConversationStatus;
  language: string;
  owner_unread: boolean;
  visitor_email: string | null;
  last_message_preview: string | null;
  last_message_role: ConversationSummary["previewRole"];
  last_message_at: string;
  bots: { name: string } | { name: string }[] | null;
};

const botName = (bots: SummaryRow["bots"]) =>
  (Array.isArray(bots) ? bots[0]?.name : bots?.name) ?? "";

const SUMMARY =
  "id, status, language, owner_unread, visitor_email, last_message_preview, last_message_role, last_message_at, bots(name)";

const toSummary = (row: SummaryRow): ConversationSummary => ({
  id: row.id,
  botName: botName(row.bots),
  status: row.status,
  language: row.language === "sr" ? "sr" : "en",
  unread: row.owner_unread,
  visitorEmail: row.visitor_email,
  preview: row.last_message_preview,
  previewRole: row.last_message_role,
  lastMessageAt: row.last_message_at,
});

export const INBOX_PAGE_SIZE = 50;

export async function listConversations(filter: InboxFilter): Promise<ConversationSummary[]> {
  await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  let query = supabase
    .from("conversations")
    .select(SUMMARY)
    .order("last_message_at", { ascending: false })
    .limit(INBOX_PAGE_SIZE);
  if (filter !== "all") query = query.eq("status", filter);
  const { data, error } = await query;
  if (error) throw new Error("Could not load conversations");
  return (data as unknown as SummaryRow[]).map(toSummary);
}

/** Counts for the filter tabs and the nav badge. */
export const getInboxCounts = cache(async () => {
  await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  const count = async (column: "status" | "owner_unread", value: string | boolean) => {
    const { count } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq(column, value);
    return count ?? 0;
  };
  const [unread, waiting, human] = await Promise.all([
    count("owner_unread", true),
    count("status", "waiting_human"),
    count("status", "human"),
  ]);
  return { unread, waiting, human };
});

export type ThreadMessage = {
  id: string;
  role: "visitor" | "bot" | "human" | "system";
  content: string;
  sourceCount: number;
  createdAt: string;
};

export type ConversationDetail = ConversationSummary & {
  createdAt: string;
  handedOffAt: string | null;
  rating: "up" | "down" | null;
  resolvedBy: "bot" | "human" | "visitor" | null;
  messages: ThreadMessage[];
};

export const getConversation = cache(async (id: string): Promise<ConversationDetail | null> => {
  if (!z.uuid().safeParse(id).success) return null;
  await requireUser();
  const supabase = (await createSupabaseServerClient())!;
  const [conversation, messages] = await Promise.all([
    supabase
      .from("conversations")
      .select(`${SUMMARY}, created_at, handed_off_at, rating, resolved_by`)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id, role, content, source_faq_ids, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);
  if (conversation.error || messages.error) throw new Error("Could not load conversation");
  if (!conversation.data) return null;
  const row = conversation.data as unknown as SummaryRow & {
    created_at: string;
    handed_off_at: string | null;
    rating: "up" | "down" | null;
    resolved_by: ConversationDetail["resolvedBy"];
  };
  return {
    ...toSummary(row),
    createdAt: row.created_at,
    handedOffAt: row.handed_off_at,
    rating: row.rating,
    resolvedBy: row.resolved_by,
    messages: (
      messages.data as {
        id: string;
        role: ThreadMessage["role"];
        content: string;
        source_faq_ids: string[];
        created_at: string;
      }[]
    ).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      sourceCount: m.source_faq_ids?.length ?? 0,
      createdAt: m.created_at,
    })),
  };
});

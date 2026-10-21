"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { redirect } from "@/i18n/navigation";
import { localeOf, ownerClient } from "@/lib/auth/owner";
import type { FormState } from "@/lib/forms";
import { log } from "@/lib/log";
import { flushOutboxAfterResponse } from "@/lib/n8n/flush";
import { pingConversation } from "@/lib/realtime/broadcast";
import { cleanText, eventContext } from "@/lib/widget/handoff";
import { formValues } from "@/lib/validation/errors";

const conversationId = z.uuid();
const replySchema = z.object({
  conversationId,
  content: z.string().trim().min(1, { error: "required" }).max(4000, { error: "tooLong" }),
});

function refresh() {
  revalidatePath("/[locale]/dashboard", "layout");
}

/**
 * The owner replies. `owner_reply` checks ownership in SQL, stores the message, moves the
 * chat to `human`, and enqueues a `reply_email` event when the visitor left an email and
 * has been away for more than three minutes. Then the open widget gets a ping.
 */
export async function replyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const supabase = await ownerClient(localeOf(values));
  const parsed = replySchema.safeParse(values);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "error",
      fieldErrors: { content: issue?.message === "tooLong" ? "tooLong" : "required" },
      values,
    };
  }

  // RLS: someone else's conversation isn't found here.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("bot_id, language")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (!conversation) return { status: "error", error: "notFound" };

  const context = await eventContext(supabase, conversation.bot_id);
  const { data, error } = await supabase.rpc("owner_reply", {
    p_conversation_id: parsed.data.conversationId,
    p_content: parsed.data.content,
    p_reply_email: {
      ...context,
      data: {
        replyText: cleanText(parsed.data.content, 4000),
        shopName: context.bot.name,
        language: conversation.language === "sr" ? "sr" : "en",
      },
    },
  });
  if (error) {
    log.error("inbox.reply_failed", { code: error.code });
    return { status: "error", error: "generic", values };
  }
  const result = data as { status: string; realtime_channel?: string; emailed?: boolean };
  if (result.status === "closed") return { status: "error", error: "conversationClosed", values };
  if (result.status !== "ok") return { status: "error", error: "notFound" };

  if (result.realtime_channel) await pingConversation(result.realtime_channel, "message");
  // The reply email goes to n8n after the owner's response is sent.
  if (result.emailed) flushOutboxAfterResponse();
  refresh();
  return { status: "success", values: { emailed: result.emailed ? "yes" : "no" } };
}

export async function resolveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const supabase = await ownerClient(localeOf(values));
  const id = conversationId.safeParse(values.conversationId);
  if (!id.success) return { status: "error", error: "notFound" };

  const { data, error } = await supabase
    .from("conversations")
    .update({ status: "resolved", resolved_by: "human", owner_unread: false })
    .eq("id", id.data)
    .neq("status", "resolved")
    .select("realtime_channel");
  if (error) {
    log.error("inbox.resolve_failed", { code: error.code });
    return { status: "error", error: "generic" };
  }
  const channel = data[0]?.realtime_channel;
  if (channel) await pingConversation(channel, "status");
  refresh();
  return { status: "success" };
}

/** Clears the unread marker when the owner opens a chat. */
export async function markReadAction(id: string): Promise<void> {
  const parsed = conversationId.safeParse(id);
  if (!parsed.success) return;
  const supabase = await ownerClient(localeOf({}));
  const { error } = await supabase
    .from("conversations")
    .update({ owner_unread: false })
    .eq("id", parsed.data)
    .eq("owner_unread", true);
  if (error) log.error("inbox.mark_read_failed", { code: error.code });
  refresh();
}

/** Deletes the chat and everything derived from it (spec §5.10). */
export async function deleteConversationAction(formData: FormData): Promise<void> {
  const values = formValues(formData);
  const locale = localeOf(values);
  const supabase = await ownerClient(locale);
  const id = conversationId.safeParse(values.conversationId);
  if (id.success) {
    const { data, error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", id.data)
      .select("realtime_channel");
    if (error) log.error("inbox.delete_failed", { code: error.code });
    // The widget learns on its next poll that the chat is gone and starts fresh.
    const channel = data?.[0]?.realtime_channel;
    if (channel) await pingConversation(channel, "status");
  }
  refresh();
  redirect({ href: "/dashboard/inbox", locale });
}

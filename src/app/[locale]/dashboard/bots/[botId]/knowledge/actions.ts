"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { localeOf, ownerClient } from "@/lib/auth/owner";
import { LANGUAGES } from "@/lib/bots/schema";
import { indexFaqs } from "@/lib/faqs/indexing";
import { faqFormSchema, faqImportSchema, FAQS_PER_BOT_MAX } from "@/lib/faqs/schema";
import { STARTER_FAQS } from "@/lib/faqs/starters";
import type { FormState } from "@/lib/forms";
import { log } from "@/lib/log";
import { fieldErrors, formValues } from "@/lib/validation/errors";

const uuid = z.uuid();

type OwnerClient = Awaited<ReturnType<typeof ownerClient>>;

function refresh() {
  revalidatePath("/[locale]/dashboard/bots/[botId]", "layout");
}

/** The owner's bot (RLS), or null. Every action that later uses the service role checks this. */
async function ownedBot(supabase: OwnerClient, botId: unknown) {
  const id = uuid.safeParse(botId);
  if (!id.success) return null;
  const { data } = await supabase.from("bots").select("id").eq("id", id.data).maybeSingle();
  return data?.id ?? null;
}

/** Remaining room under the per-bot FAQ cap (a soft limit, so a count is fine here). */
async function room(supabase: OwnerClient, botId: string) {
  const { count } = await supabase
    .from("faqs")
    .select("id", { count: "exact", head: true })
    .eq("bot_id", botId);
  return FAQS_PER_BOT_MAX - (count ?? 0);
}

const embeddingOutcome = (result: { failed: number }) =>
  result.failed > 0 ? "embedFailed" : "embedded";

export async function createFaqAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const supabase = await ownerClient(localeOf(values));
  const botId = await ownedBot(supabase, values.botId);
  if (!botId) return { status: "error", error: "notFound" };

  const parsed = faqFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrors(parsed.error), values };
  }
  if ((await room(supabase, botId)) < 1) {
    return { status: "error", error: "faqLimitReached", values };
  }

  const { data, error } = await supabase
    .from("faqs")
    .insert({ bot_id: botId, ...parsed.data })
    .select("id")
    .single();
  if (error) {
    log.error("faqs.create_failed", { code: error.code });
    return { status: "error", error: "generic", values };
  }

  await markUnknownAdded(supabase, botId, values.unknownIds);
  const result = await indexFaqs(botId, [data.id]);
  refresh();
  return { status: "success", values: { action: "created", outcome: embeddingOutcome(result) } };
}

const unknownIds = z.array(uuid).max(300);

/**
 * An FAQ created from Analytics answers these unknown questions: they leave the open list.
 * RLS (and the bot filter) keep it to this owner's own rows.
 */
async function markUnknownAdded(supabase: OwnerClient, botId: string, raw: string | undefined) {
  const ids = unknownIds.safeParse(raw ? raw.split(",") : []);
  if (!ids.success || ids.data.length === 0) return;
  const { error } = await supabase
    .from("unknown_questions")
    .update({ status: "added" })
    .eq("bot_id", botId)
    .eq("status", "open")
    .in("id", ids.data);
  if (error) log.error("unknown.mark_added_failed", { code: error.code });
  revalidatePath("/[locale]/dashboard/analytics", "page");
}

export async function updateFaqAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const supabase = await ownerClient(localeOf(values));
  const botId = await ownedBot(supabase, values.botId);
  const faqId = uuid.safeParse(values.faqId);
  if (!botId || !faqId.success) return { status: "error", error: "notFound" };

  const parsed = faqFormSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrors(parsed.error), values };
  }

  // A text change resets the embedding to pending (database trigger); re-index only then.
  const { data, error } = await supabase
    .from("faqs")
    .update(parsed.data)
    .eq("id", faqId.data)
    .eq("bot_id", botId)
    .select("id, embedding_status");
  if (error) {
    log.error("faqs.update_failed", { code: error.code });
    return { status: "error", error: "generic", values };
  }
  if (data.length === 0) return { status: "error", error: "notFound" };

  let outcome = "embedded";
  if (data[0]!.embedding_status !== "ready") {
    outcome = embeddingOutcome(await indexFaqs(botId, [faqId.data]));
  }
  refresh();
  return { status: "success", values: { action: "updated", outcome } };
}

export async function deleteFaqAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const supabase = await ownerClient(localeOf(values));
  const faqId = uuid.safeParse(values.faqId);
  const botId = uuid.safeParse(values.botId);
  if (!faqId.success || !botId.success) return { status: "error", error: "notFound" };

  const { error } = await supabase
    .from("faqs")
    .delete()
    .eq("id", faqId.data)
    .eq("bot_id", botId.data);
  if (error) {
    log.error("faqs.delete_failed", { code: error.code });
    return { status: "error", error: "generic", values: { faqId: faqId.data } };
  }
  refresh();
  return { status: "success", values: { action: "deleted" } };
}

export async function importFaqsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const supabase = await ownerClient(localeOf(values));
  const botId = await ownedBot(supabase, values.botId);
  if (!botId) return { status: "error", error: "notFound" };

  const parsed = faqImportSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const { language, items } = parsed.data;
  if ((await room(supabase, botId)) < items.length) {
    return { status: "error", error: "faqLimitReached" };
  }

  const { data, error } = await supabase
    .from("faqs")
    .insert(items.map((item) => ({ bot_id: botId, language, ...item })))
    .select("id");
  if (error) {
    log.error("faqs.import_failed", { code: error.code, count: items.length });
    return { status: "error", error: "generic" };
  }

  const result = await indexFaqs(
    botId,
    data.map((row) => row.id),
  );
  refresh();
  return {
    status: "success",
    values: {
      action: "imported",
      count: String(data.length),
      outcome: embeddingOutcome(result),
    },
  };
}

export async function reindexFaqsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const supabase = await ownerClient(localeOf(values));
  const botId = await ownedBot(supabase, values.botId);
  if (!botId) return { status: "error", error: "notFound" };

  const result = await indexFaqs(botId);
  refresh();
  if (result.failed > 0) return { status: "error", error: "embedUnavailable" };
  return { status: "success", values: { action: "reindexed", count: String(result.indexed) } };
}

export async function addStarterFaqsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const supabase = await ownerClient(localeOf(values));
  const botId = await ownedBot(supabase, values.botId);
  const language = z.enum(LANGUAGES).safeParse(values.language);
  if (!botId || !language.success) return { status: "error", error: "notFound" };

  // Only for an empty knowledge base: a repeat click after the set exists adds nothing.
  if ((await room(supabase, botId)) < FAQS_PER_BOT_MAX) {
    refresh();
    return { status: "success", values: { action: "starters" } };
  }

  const { data, error } = await supabase
    .from("faqs")
    .insert(
      STARTER_FAQS[language.data].map((faq) => ({
        bot_id: botId,
        language: language.data,
        ...faq,
      })),
    )
    .select("id");
  if (error) {
    log.error("faqs.starters_failed", { code: error.code });
    return { status: "error", error: "generic" };
  }

  const result = await indexFaqs(
    botId,
    data.map((row) => row.id),
  );
  refresh();
  return { status: "success", values: { action: "starters", outcome: embeddingOutcome(result) } };
}

"use server";

import { randomUUID } from "node:crypto";

import { hasLocale } from "next-intl";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/session";
import { detectLogoType, LOGO_MAX_BYTES } from "@/lib/bots/logo";
import { botFormSchema, toBotColumns } from "@/lib/bots/schema";
import type { FormState } from "@/lib/forms";
import { log } from "@/lib/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrors, formValues } from "@/lib/validation/errors";

const LOGO_BUCKET = "bot-logos";

function localeOf(values: Record<string, string>): Locale {
  return hasLocale(routing.locales, values.locale) ? values.locale : routing.defaultLocale;
}

/** Authorizes the request and returns a client acting as the owner (RLS applies). */
async function ownerClient(locale: Locale) {
  await requireUser(locale);
  return (await createSupabaseServerClient())!;
}

const botId = z.uuid();

function refreshDashboard() {
  revalidatePath("/[locale]/dashboard", "layout");
}

export async function createBotAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const locale = localeOf(values);
  const supabase = await ownerClient(locale);

  const parsed = botFormSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const { data, error } = await supabase
    .from("bots")
    .insert(toBotColumns(parsed.data))
    .select("id")
    .single();
  if (error) {
    // Raised by the plan-limit trigger; the UI also hides "New bot" at the limit.
    if (error.message === "bot_limit_reached") return { status: "error", error: "botLimitReached" };
    log.error("bots.create_failed", { code: error.code });
    return { status: "error", error: "generic" };
  }

  refreshDashboard();
  return redirect({ href: `/dashboard/bots/${data.id}`, locale });
}

export async function updateBotAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const locale = localeOf(values);
  const supabase = await ownerClient(locale);
  const id = botId.safeParse(values.botId);
  if (!id.success) return { status: "error", error: "notFound" };

  const parsed = botFormSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  // RLS turns someone else's bot id into "0 rows updated", which we report as not found.
  const { data, error } = await supabase
    .from("bots")
    .update(toBotColumns(parsed.data))
    .eq("id", id.data)
    .select("id");
  if (error) {
    log.error("bots.update_failed", { code: error.code });
    return { status: "error", error: "generic" };
  }
  if (data.length === 0) return { status: "error", error: "notFound" };

  refreshDashboard();
  return { status: "success" };
}

export async function deleteBotAction(formData: FormData): Promise<void> {
  const values = formValues(formData);
  const locale = localeOf(values);
  const supabase = await ownerClient(locale);
  const id = botId.safeParse(values.botId);

  if (id.success) {
    // Remove stored logos first; storage objects don't cascade with the row.
    const { data: files } = await supabase.storage.from(LOGO_BUCKET).list(id.data);
    if (files?.length) {
      await supabase.storage.from(LOGO_BUCKET).remove(files.map((f) => `${id.data}/${f.name}`));
    }
    const { error } = await supabase.from("bots").delete().eq("id", id.data);
    if (error) log.error("bots.delete_failed", { code: error.code });
  }

  refreshDashboard();
  redirect({ href: "/dashboard/bots", locale });
}

export async function uploadLogoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const locale = localeOf(values);
  const supabase = await ownerClient(locale);
  const id = botId.safeParse(values.botId);
  if (!id.success) return { status: "error", error: "notFound" };

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", fieldErrors: { logo: "logoMissing" } };
  }
  if (file.size > LOGO_MAX_BYTES) return { status: "error", fieldErrors: { logo: "logoTooLarge" } };

  // Trust the bytes, not the file name or the browser's content type.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectLogoType(bytes);
  if (!type) return { status: "error", fieldErrors: { logo: "logoType" } };

  const { data: bot } = await supabase
    .from("bots")
    .select("logo_path")
    .eq("id", id.data)
    .maybeSingle();
  if (!bot) return { status: "error", error: "notFound" };

  // A fresh random name per upload: no cache-busting games, and old URLs simply stop working.
  const path = `${id.data}/${randomUUID()}.${type.ext}`;
  const upload = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, bytes, { contentType: type.mime, upsert: false, cacheControl: "31536000" });
  if (upload.error) {
    log.error("bots.logo_upload_failed", { reason: upload.error.name });
    return { status: "error", error: "generic" };
  }

  const { error } = await supabase.from("bots").update({ logo_path: path }).eq("id", id.data);
  if (error) {
    await supabase.storage.from(LOGO_BUCKET).remove([path]);
    log.error("bots.logo_save_failed", { code: error.code });
    return { status: "error", error: "generic" };
  }
  if (bot.logo_path) await supabase.storage.from(LOGO_BUCKET).remove([bot.logo_path]);

  refreshDashboard();
  return { status: "success", values: { action: "uploaded" } };
}

export async function removeLogoAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData);
  const locale = localeOf(values);
  const supabase = await ownerClient(locale);
  const id = botId.safeParse(values.botId);
  if (!id.success) return { status: "error", error: "notFound" };

  const { data: bot } = await supabase
    .from("bots")
    .select("logo_path")
    .eq("id", id.data)
    .maybeSingle();
  if (!bot) return { status: "error", error: "notFound" };

  const { error } = await supabase.from("bots").update({ logo_path: null }).eq("id", id.data);
  if (error) return { status: "error", error: "generic" };
  if (bot.logo_path) await supabase.storage.from(LOGO_BUCKET).remove([bot.logo_path]);

  refreshDashboard();
  return { status: "success", values: { action: "removed" } };
}

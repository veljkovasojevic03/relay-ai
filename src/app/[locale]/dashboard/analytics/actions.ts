"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { localeOf, ownerClient } from "@/lib/auth/owner";
import { log } from "@/lib/log";
import { formValues } from "@/lib/validation/errors";

const ids = z.array(z.uuid()).min(1).max(300);

/** "Not worth an FAQ": the question (and its repeats) leaves the open list. RLS-scoped. */
export async function dismissUnknownAction(formData: FormData): Promise<void> {
  const values = formValues(formData);
  const supabase = await ownerClient(localeOf(values));
  const parsed = ids.safeParse((values.ids ?? "").split(","));
  if (!parsed.success) return;
  const { error } = await supabase
    .from("unknown_questions")
    .update({ status: "dismissed" })
    .eq("status", "open")
    .in("id", parsed.data);
  if (error) log.error("unknown.dismiss_failed", { code: error.code });
  revalidatePath("/[locale]/dashboard/analytics", "page");
}

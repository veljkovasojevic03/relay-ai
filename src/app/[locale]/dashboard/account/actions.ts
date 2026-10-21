"use server";

import { hasLocale } from "next-intl";
import { revalidatePath } from "next/cache";

import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { requireUser } from "@/lib/auth/session";
import type { FormState } from "@/lib/forms";
import { log } from "@/lib/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fieldErrors, formValues, profileSchema } from "@/lib/validation/auth";

export async function updateProfileAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = formValues(formData);
  const locale = hasLocale(routing.locales, values.locale) ? values.locale : routing.defaultLocale;
  // Re-authorize inside the action; never trust that the page was protected.
  const user = await requireUser(locale);

  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error), values };

  const supabase = (await createSupabaseServerClient())!;
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.displayName,
      ui_language: parsed.data.uiLanguage,
      notification_email: parsed.data.notificationEmail,
      weekly_digest: parsed.data.weeklyDigest,
    })
    .eq("id", user.id);
  if (error) {
    log.error("profile.update_failed", { code: error.code });
    return { status: "error", error: "generic", values };
  }

  revalidatePath("/[locale]/dashboard", "layout");
  // A new dashboard language takes effect right away.
  if (parsed.data.uiLanguage !== locale) {
    return redirect({ href: "/dashboard/account", locale: parsed.data.uiLanguage });
  }
  return { status: "success" };
}

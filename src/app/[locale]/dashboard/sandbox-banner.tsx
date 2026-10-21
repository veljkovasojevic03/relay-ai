import { FlaskConical } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getCurrentUser, getOwnerProfile } from "@/lib/auth/session";

import { endSandboxAction } from "../(marketing)/sandbox/actions";

/** Tells a sandbox visitor what they are looking at and when it disappears. */
export async function SandboxBanner() {
  if (!(await getCurrentUser())) return null;
  const profile = await getOwnerProfile();
  if (!profile.isSandbox || !profile.sandboxExpiresAt) return null;
  const [t, format, locale] = await Promise.all([
    getTranslations("Sandbox.banner"),
    getFormatter(),
    getLocale(),
  ]);

  return (
    <section
      aria-label={t("label")}
      className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/30 bg-accent p-4 text-accent-foreground sm:flex-row sm:items-center"
    >
      <FlaskConical className="size-5 shrink-0" aria-hidden="true" />
      <p className="text-sm text-pretty">
        {t("text", {
          date: format.dateTime(new Date(profile.sandboxExpiresAt), { dateStyle: "long" }),
        })}
      </p>
      <form action={endSandboxAction} className="sm:ml-auto">
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" size="sm" variant="outline" className="bg-card">
          {t("signUp")}
        </Button>
      </form>
    </section>
  );
}

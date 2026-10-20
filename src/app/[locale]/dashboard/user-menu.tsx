import { getLocale, getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCurrentUser, getOwnerProfile } from "@/lib/auth/session";

import { signOutAction } from "../(auth)/actions";

export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [profile, locale, t] = await Promise.all([
    getOwnerProfile(),
    getLocale(),
    getTranslations("Dashboard"),
  ]);

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-40 truncate text-sm font-medium md:inline">
        {profile.displayName ?? user.email}
      </span>
      <form action={signOutAction}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="ghost" size="sm">
          <LogOut aria-hidden="true" />
          <span className="max-sm:sr-only">{t("signOut")}</span>
        </Button>
      </form>
    </div>
  );
}

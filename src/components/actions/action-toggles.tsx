"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useOptimistic, useState, useTransition } from "react";

import { toggleActionAction } from "@/app/[locale]/dashboard/bots/[botId]/actions/actions";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { BotAction } from "@/lib/actions/queries";

/** One switch per registry action. Optimistic, rolled back with a message on failure. */
export function ActionToggles({ botId, actions }: { botId: string; actions: BotAction[] }) {
  const t = useTranslations("Actions");
  const locale = useLocale();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useOptimistic(
    actions,
    (state, change: { name: BotAction["name"]; enabled: boolean }) =>
      state.map((a) => (a.name === change.name ? { ...a, enabled: change.enabled } : a)),
  );

  function toggle(name: BotAction["name"], enabled: boolean) {
    setError(null);
    startTransition(async () => {
      setOptimistic({ name, enabled });
      const result = await toggleActionAction({ botId, action: name, enabled, locale });
      if (!result.ok) setError(t(`errors.${result.error}`));
    });
  }

  return (
    <div className="grid gap-3">
      <ul className="grid gap-3">
        {optimistic.map((action) => {
          const switchId = `${id}-${action.name}`;
          return (
            <li key={action.name} className="flex items-start gap-3 rounded-xl border bg-card p-4">
              <Switch
                id={switchId}
                checked={action.enabled}
                disabled={!action.available || pending}
                onCheckedChange={(v) => toggle(action.name, v)}
                aria-describedby={`${switchId}-hint`}
              />
              <div className="grid min-w-0 gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={switchId}>{t(`names.${action.name}`)}</Label>
                  {action.requiresConfirmation && (
                    <Badge variant="outline">{t("confirmBadge")}</Badge>
                  )}
                </div>
                <p id={`${switchId}-hint`} className="text-sm text-muted-foreground">
                  {t(`descriptions.${action.name}`)}
                  {!action.available && <> {t("demoOnly")}</>}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <p role="alert" className="text-sm text-destructive empty:hidden">
        {error}
      </p>
    </div>
  );
}

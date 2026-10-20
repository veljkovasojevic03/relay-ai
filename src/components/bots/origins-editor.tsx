"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_ORIGINS, normalizeOrigin } from "@/lib/bots/origins";
import type { ErrorKey } from "@/lib/validation/errors";

/**
 * List editor for allowed origins. Entries are normalized as they're added (the same
 * function the server uses), so what the owner sees is exactly what gets stored.
 */
export function OriginsEditor({
  origins,
  onChange,
  serverError,
}: {
  origins: string[];
  onChange: (next: string[]) => void;
  serverError?: ErrorKey;
}) {
  const t = useTranslations("Bots.origins");
  const tErrors = useTranslations("Errors");
  const id = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<ErrorKey | undefined>();
  const shownError = error ?? serverError;

  function add() {
    if (!draft.trim()) return;
    if (origins.length >= MAX_ORIGINS) return setError("tooManyOrigins");
    const result = normalizeOrigin(draft);
    if (!result.ok) return setError(result.error);
    if (origins.includes(result.origin)) return setError("duplicateOrigin");
    onChange([...origins, result.origin]);
    setDraft("");
    setError(undefined);
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{t("label")}</Label>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {t("hint")}
      </p>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={t("placeholder")}
          aria-describedby={`${id}-hint${shownError ? ` ${id}-error` : ""}`}
          aria-invalid={shownError ? true : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(undefined);
          }}
          onKeyDown={(e) => {
            // Enter adds the origin instead of submitting the whole form.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add}>
          <Plus aria-hidden="true" />
          {t("add")}
        </Button>
      </div>
      {shownError && (
        <p id={`${id}-error`} className="text-sm font-medium text-destructive">
          {tErrors(shownError)}
        </p>
      )}
      {origins.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label={t("label")}>
          {origins.map((origin) => (
            <li
              key={origin}
              className="inline-flex items-center gap-1 rounded-full border bg-muted py-1 pr-1 pl-3 font-mono text-xs"
            >
              {origin}
              <button
                type="button"
                onClick={() => onChange(origins.filter((o) => o !== origin))}
                aria-label={t("remove", { origin })}
                className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

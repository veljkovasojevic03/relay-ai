"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ErrorKey } from "@/lib/validation/auth";

type Props = Omit<React.ComponentProps<typeof Input>, "id"> & {
  label: string;
  hint?: string;
  error?: ErrorKey;
  optional?: boolean;
  /** Replaces the default input, e.g. a password field with a reveal toggle. */
  control?: (props: React.ComponentProps<typeof Input>) => ReactNode;
};

/** Labelled input with hint and error wired up through aria-describedby. */
export function FormField({ label, hint, error, optional, control, ...inputProps }: Props) {
  const t = useTranslations();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;
  const props = {
    ...inputProps,
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  };

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && (
          <span className="font-normal text-muted-foreground">({t("Auth.fields.optional")})</span>
        )}
      </Label>
      {control ? control(props) : <Input {...props} />}
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {t(`Errors.${error}`)}
        </p>
      )}
    </div>
  );
}

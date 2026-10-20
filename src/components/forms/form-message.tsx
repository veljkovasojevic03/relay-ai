"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ErrorKey } from "@/lib/validation/auth";

/** Form-level error (role=alert, announced immediately). */
export function FormError({ error }: { error?: ErrorKey }) {
  const t = useTranslations("Errors");
  if (!error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{t(error)}</AlertDescription>
    </Alert>
  );
}

/** Polite success confirmation (role=status). */
export function FormSuccess({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm font-medium text-success">
      <CircleCheck className="size-4" aria-hidden="true" />
      {children}
    </p>
  );
}

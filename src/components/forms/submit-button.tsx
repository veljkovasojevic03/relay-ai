"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/** Submit button that disables itself and announces progress while its form is pending. */
export function SubmitButton({
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "type">) {
  const { pending } = useFormStatus();
  const t = useTranslations("Auth");

  return (
    <Button type="submit" disabled={pending || props.disabled} aria-disabled={pending} {...props}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          <span>{t("pending")}</span>
        </>
      ) : (
        children
      )}
    </Button>
  );
}

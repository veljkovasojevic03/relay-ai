"use client";

import { Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import { useActionState, useEffect, useRef, useState } from "react";

import { FormError } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { idle } from "@/lib/forms";

import { startSandboxAction } from "./actions";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** `siteKey` is null when Turnstile isn't configured; the server then skips the check. */
export function SandboxForm({ siteKey }: { siteKey: string | null }) {
  const t = useTranslations("Sandbox");
  const locale = useLocale();
  const [state, action] = useActionState(startSandboxAction, idle);
  const [token, setToken] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    const el = container.current;
    if (!siteKey || !scriptReady || !el || !window.turnstile) return;
    const turnstile = window.turnstile;
    widgetId.current = turnstile.render(el, {
      sitekey: siteKey,
      action: "sandbox",
      language: locale,
      // The token lands in a hidden `cf-turnstile-response` input inside this form.
      callback: (value: string) => setToken(value),
      "expired-callback": () => setToken(null),
      "error-callback": () => setToken(null),
    });
    return () => {
      if (widgetId.current) turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, scriptReady, locale]);

  // A token is single-use: after a failed attempt, get a fresh one.
  useEffect(() => {
    if (state.status === "error" && widgetId.current && window.turnstile) {
      setToken(null);
      window.turnstile.reset(widgetId.current);
    }
  }, [state]);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="locale" value={locale} />
      <ExpiredNotice />
      <FormError error={state.status === "error" ? state.error : undefined} />
      {siteKey && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onReady={() => setScriptReady(true)}
          />
          <div ref={container} className="min-h-[65px]" aria-label={t("captchaLabel")} />
        </>
      )}
      <SubmitButton size="lg" className="w-full sm:w-fit" disabled={Boolean(siteKey) && !token}>
        {t("start")}
      </SubmitButton>
      {siteKey && !token && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("captchaWaiting")}
        </p>
      )}
    </form>
  );
}

function ExpiredNotice() {
  const t = useTranslations("Sandbox");
  const params = useSearchParams();
  if (params.get("expired") !== "1") return null;
  return (
    <Alert role="status">
      <Clock aria-hidden="true" />
      <AlertDescription>{t("expired")}</AlertDescription>
    </Alert>
  );
}

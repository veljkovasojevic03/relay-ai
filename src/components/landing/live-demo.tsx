"use client";

import { Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DEMO_BOT_PUBLIC_KEY, type Lang } from "@/lib/demo/kroj";

type RelayGlobal = {
  mount: (container: HTMLElement, options: { bot: string; lang?: Lang }) => Promise<boolean>;
  ask: (text: string, bot?: string) => boolean;
};

const relay = () => (window as { RelayAI?: Partial<RelayGlobal> }).RelayAI;

/** Loads public/widget.js once; it registers window.RelayAI. */
function loadWidget(): Promise<void> {
  if (relay()?.mount) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/widget.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("widget failed to load"));
    document.head.appendChild(script);
  });
}

/** Runs after the page has loaded and gone idle, so the chat never delays the first paint. */
function whenIdle(run: () => void): () => void {
  let cancelled = false;
  const start = () => {
    if (cancelled) return;
    if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 2500 });
    else setTimeout(run, 300);
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", start);
  };
}

/**
 * The hero's live demo (spec §4.10): the real widget, talking to the Kroj demo store's bot,
 * inside a small browser frame. Until it loads, a still picture of the same chat.
 */
export type LiveDemoCopy = {
  shopTagline: string;
  caption: string;
  greeting: string;
  loading: string;
  failed: string;
};

/** Copy comes from the server as props, so this needs no message formatting code. */
export function LiveDemo({
  lang,
  questions,
  copy,
}: {
  lang: Lang;
  questions: string[];
  copy: LiveDemoCopy;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "live" | "failed">("loading");

  useEffect(() => {
    return whenIdle(() => {
      const el = container.current;
      if (!el) return;
      loadWidget()
        .then(() => relay()!.mount!(el, { bot: DEMO_BOT_PUBLIC_KEY, lang }))
        .then((ok) => setState(ok ? "live" : "failed"))
        .catch(() => setState("failed"));
    });
  }, [lang]);

  return (
    <figure className="grid gap-3">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2" aria-hidden="true">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#e0913f]/70" />
            <span className="size-2.5 rounded-full bg-[#d9cab8]" />
            <span className="size-2.5 rounded-full bg-[#d9cab8]" />
          </span>
          <span className="mx-auto flex items-center gap-1 rounded-md bg-card px-3 py-0.5 text-xs text-muted-foreground">
            <Lock className="size-3" />
            kroj.example
          </span>
        </div>
        <div className="grid gap-3 bg-[#f7f5f1] p-3 sm:p-4">
          <div className="flex items-baseline justify-between text-[#171717]" aria-hidden="true">
            <span className="font-serif text-lg tracking-[0.2em]">KROJ</span>
            <span className="text-[11px] tracking-wide uppercase">{copy.shopTagline}</span>
          </div>
          {/* The widget renders into this element's shadow root. */}
          <div ref={container} className="min-h-[440px]" data-testid="landing-live-chat">
            {state !== "live" && <StillChat failed={state === "failed"} copy={copy} />}
          </div>
        </div>
      </div>
      <figcaption className="grid gap-2 text-sm text-muted-foreground">
        <span>{copy.caption}</span>
        <span className="flex flex-wrap gap-2">
          {questions.map((q) => (
            <button
              key={q}
              type="button"
              disabled={state !== "live"}
              onClick={() => relay()?.ask?.(q, DEMO_BOT_PUBLIC_KEY)}
              className="rounded-full border bg-card px-3 py-1 text-foreground transition-colors hover:border-primary disabled:opacity-60"
            >
              {q}
            </button>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}

function StillChat({ failed, copy }: { failed: boolean; copy: LiveDemoCopy }) {
  return (
    <div className="grid h-[440px] content-start gap-3 rounded-xl border bg-card p-4 text-sm">
      <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3 py-2">{copy.greeting}</p>
      <p role="status" className="mt-auto text-center text-muted-foreground">
        {failed ? copy.failed : copy.loading}
      </p>
    </div>
  );
}

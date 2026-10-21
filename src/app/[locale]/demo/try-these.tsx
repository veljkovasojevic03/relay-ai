"use client";

import { Check, ChevronDown, Copy, MessageCircleQuestion, RotateCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import {
  DEMO_BOT_PUBLIC_KEY,
  TRY_ORDERS,
  TRY_QUESTIONS,
  type Lang,
  type TryKind,
} from "@/lib/demo/kroj";

/** Native names, the same in both interface languages. */
const LANGUAGE_NAMES: Record<Lang, string> = { en: "English", sr: "Srpski" };

type BotState = "checking" | "ready" | "missing" | "unavailable" | "waking";

/**
 * The "Try these" panel (spec §4.10): sample questions that go straight into the chat
 * (window.RelayAI.ask), and demo orders with their emails to copy. It also says so when
 * the demo bot can't load, instead of leaving a page without a chat button.
 */
export function TryThese() {
  const t = useTranslations("Demo.try");
  const locale = useLocale() as Lang;
  const [lang, setLang] = useState<Lang>(locale);
  const [bot, setBot] = useState<BotState>("checking");
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void probeDemoBot().then(setBot);
  }, []);

  function retry() {
    setBot("checking");
    void probeDemoBot().then(setBot);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied((c) => (c === value ? null : c)), 1500);
    } catch {
      setNotice(t("copyFailed"));
    }
  }

  function ask(text: string) {
    // Registered by public/widget.js (widget/src/index.ts) once the chat has mounted.
    const relay = (window as { RelayAI?: { ask?: (text: string) => boolean } }).RelayAI;
    const sent = relay?.ask?.(text) ?? false;
    setNotice(sent ? null : t("chatLoading"));
    if (!sent) void copy(text);
  }

  const panel = { lang, setLang, bot, retry, ask, copy, copied, notice };

  // Two placements of the same panel, so neither needs JavaScript to fit the screen: a
  // sidebar next to the shop on wide screens, a collapsed section above it on small ones.
  return (
    <>
      <aside
        aria-label={t("title")}
        className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-[#e5e2dc] bg-white text-[#171717] lg:block"
      >
        <h2 className="flex items-center gap-2 px-4 pt-4 pb-3 font-semibold">
          <MessageCircleQuestion className="size-4 text-[#1f3d36]" aria-hidden="true" />
          {t("title")}
        </h2>
        <PanelBody {...panel} />
      </aside>
      <details className="group border-b border-[#e5e2dc] bg-white text-[#171717] lg:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#1f3d36] [&::-webkit-details-marker]:hidden">
          <MessageCircleQuestion className="size-4 text-[#1f3d36]" aria-hidden="true" />
          {t("title")}
          <ChevronDown
            className="ml-auto size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <PanelBody {...panel} />
      </details>
    </>
  );
}

function PanelBody({
  lang,
  setLang,
  bot,
  retry,
  ask,
  copy,
  copied,
  notice,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  bot: BotState;
  retry: () => void;
  ask: (text: string) => void;
  copy: (value: string) => Promise<void>;
  copied: string | null;
  notice: string | null;
}) {
  const t = useTranslations("Demo.try");
  const id = useId();

  return (
    <div className="grid gap-4 px-4 pb-4 text-sm">
      <BotStatus state={bot} onRetry={retry} />

      <section aria-labelledby={`${id}-questions`} className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id={`${id}-questions`} className="text-xs font-semibold tracking-wide uppercase">
            {t("questions")}
          </h3>
          <div role="group" aria-label={t("questionLanguage")} className="flex gap-1">
            {(["en", "sr"] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                aria-label={LANGUAGE_NAMES[l]}
                lang={l}
                onClick={() => setLang(l)}
                className="rounded-full border border-[#d4d0c8] px-2 py-0.5 text-xs font-semibold uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f3d36] aria-pressed:border-[#1f3d36] aria-pressed:bg-[#1f3d36] aria-pressed:text-white"
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[#525252]">{t("questionsHint")}</p>
        <ul className="grid gap-1.5">
          {TRY_QUESTIONS[lang].map((q) => (
            <li key={q.text}>
              <button
                type="button"
                lang={lang}
                onClick={() => ask(q.text)}
                className="flex w-full items-center gap-2 rounded-lg border border-[#e5e2dc] px-3 py-2 text-left hover:border-[#1f3d36] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f3d36]"
              >
                <span className="flex-1">{q.text}</span>
                <KindTag kind={q.kind} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`${id}-orders`} className="grid gap-2">
        <h3 id={`${id}-orders`} className="text-xs font-semibold tracking-wide uppercase">
          {t("orders")}
        </h3>
        <p className="text-[#525252]">{t("ordersHint")}</p>
        <ul className="grid gap-1.5">
          {TRY_ORDERS.map((o) => (
            <li
              key={o.orderNumber}
              className="grid grid-cols-[1fr_auto] items-center gap-x-2 rounded-lg bg-[#f4f1ec] px-3 py-2"
            >
              <span className="font-mono text-[13px] font-semibold">{o.orderNumber}</span>
              <span className="text-xs text-[#525252]">{t(`status.${o.status}`)}</span>
              <span className="truncate font-mono text-xs text-[#404040]">{o.email}</span>
              <span className="flex gap-1">
                <CopyButton
                  label={t("copyOrder", { order: o.orderNumber })}
                  done={copied === o.orderNumber}
                  onClick={() => copy(o.orderNumber)}
                />
                <CopyButton
                  label={t("copyEmail", { email: o.email })}
                  done={copied === o.email}
                  onClick={() => copy(o.email)}
                />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p role="status" className="text-xs text-[#525252] empty:hidden">
        {notice ?? (copied ? t("copied") : "")}
      </p>
    </div>
  );
}

/** Whether the demo bot's config loads, the same request the widget makes first. */
async function probeDemoBot(): Promise<BotState> {
  try {
    const res = await fetch(`/api/widget/config?bot=${DEMO_BOT_PUBLIC_KEY}`, { cache: "no-store" });
    if (res.status === 404) return "missing";
    if (!res.ok) return "waking";
    const config = (await res.json()) as { available?: boolean };
    return config.available ? "ready" : "unavailable";
  } catch {
    return "waking";
  }
}

function BotStatus({ state, onRetry }: { state: BotState; onRetry: () => void }) {
  const t = useTranslations("Demo.try.bot");
  if (state === "ready" || state === "checking") return null;
  return (
    <div role="status" className="grid gap-2 rounded-lg bg-[#fff4e5] p-3 text-[#5c3a00]">
      <p>{t(state)}</p>
      {state === "waking" && (
        <button
          type="button"
          onClick={onRetry}
          className="flex w-fit items-center gap-1.5 rounded-full border border-current px-3 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <RotateCw className="size-3.5" aria-hidden="true" />
          {t("retry")}
        </button>
      )}
    </div>
  );
}

function KindTag({ kind }: { kind: TryKind }) {
  const t = useTranslations("Demo.try.kind");
  return (
    <span className="shrink-0 rounded-full bg-[#eef3f1] px-2 py-0.5 text-[11px] font-semibold text-[#1f3d36]">
      {t(kind)}
    </span>
  );
}

function CopyButton({
  label,
  done,
  onClick,
}: {
  label: string;
  done: boolean;
  onClick: () => void;
}) {
  const Icon = done ? Check : Copy;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-[#1f3d36] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f3d36]"
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  );
}

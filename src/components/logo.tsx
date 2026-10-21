import { cn } from "@/lib/utils";

/** Logo mark: two overlapping chat bubbles with a hand-off arrow. Decorative unless labelled. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("size-8", className)}>
      <path
        d="M4 7a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-7l-4 3.5V16a3 3 0 0 1-3-3V7Z"
        className="fill-primary"
      />
      <path
        d="M28 15a3 3 0 0 0-3-3h-2v1a5 5 0 0 1-5 5h-6v1a3 3 0 0 0 3 3h6l4 3.5V22a3 3 0 0 0 3-3v-4Z"
        className="fill-accent-strong"
      />
      <path
        d="M9 10h7m0 0-2.5-2.5M16 10l-2.5 2.5"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wordmark: "Relay" plus a small "AI" badge. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {/* The space makes the text "Relay AI" for screen readers and for the link labels that
          must contain it; flex layout doesn't draw it, the gap does. */}
      <span className="font-display text-xl font-semibold tracking-tight">Relay</span>{" "}
      <span className="rounded-md bg-primary px-1.5 py-0.5 text-[0.6875rem] leading-none font-semibold text-primary-foreground">
        AI
      </span>
    </span>
  );
}

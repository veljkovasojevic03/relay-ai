"use client";

import { UserRound } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";

export type HandoffCopy = { question: string; reply: string; you: string };

/**
 * The hand-off picture in "How it works". Server-rendered as a still picture; the animated
 * version (and the `motion` library) loads only when it scrolls near, so the landing page's
 * first paint carries no animation code. Decorative: the step's text says the same thing.
 */
export function Handoff(copy: HandoffCopy) {
  const ref = useRef<HTMLDivElement>(null);
  const [Animated, setAnimated] = useState<ComponentType<HandoffCopy> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        void import("./handoff-animation").then((mod) => setAnimated(() => mod.default));
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden="true">
      {Animated ? <Animated {...copy} /> : <Still {...copy} />}
    </div>
  );
}

function Still({ question, reply, you }: HandoffCopy) {
  return (
    <div className="grid gap-2 text-xs">
      <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-3 py-2 text-background">
        {question}
      </p>
      <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3 py-2">{reply}</p>
      <div className="mt-1 flex h-9 items-center">
        <div className="h-px flex-1 border-t border-dashed border-primary/50" />
        <span className="ml-2 flex items-center gap-1.5 rounded-full border border-primary bg-card px-2.5 py-1 font-semibold text-primary">
          <UserRound className="size-3.5" />
          {you}
        </span>
      </div>
    </div>
  );
}

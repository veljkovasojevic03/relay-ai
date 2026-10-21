"use client";

import { LazyMotion, MotionConfig, domAnimation, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { UserRound } from "lucide-react";

import type { HandoffCopy } from "./handoff";

/**
 * The hand-off, animated with `motion`: the bot isn't sure, so the conversation travels to
 * the owner. Loaded only when the step scrolls near (see handoff.tsx). Loops gently, and
 * stands still for visitors who ask for less motion.
 */
export default function HandoffAnimation(copy: HandoffCopy) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <Animated {...copy} />
      </LazyMotion>
    </MotionConfig>
  );
}

function Animated({ question, reply, you }: HandoffCopy) {
  const still = useReducedMotion() ?? false;
  const loop = { duration: 4.5, repeat: Infinity, repeatDelay: 0.8, ease: "easeInOut" } as const;

  return (
    <div aria-hidden="true" className="grid gap-2 text-xs">
      <m.p
        className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-3 py-2 text-background"
        animate={still ? undefined : { opacity: [0, 1, 1, 1, 1], y: [6, 0, 0, 0, 0] }}
        transition={{ ...loop, times: [0, 0.12, 0.5, 0.9, 1] }}
      >
        {question}
      </m.p>
      <m.p
        className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3 py-2"
        animate={still ? undefined : { opacity: [0, 0, 1, 1, 1], y: [6, 6, 0, 0, 0] }}
        transition={{ ...loop, times: [0, 0.18, 0.3, 0.9, 1] }}
      >
        {reply}
      </m.p>
      <div className="relative mt-1 flex h-9 items-center">
        <div className="h-px flex-1 border-t border-dashed border-primary/50" />
        <m.span
          className="absolute left-0 size-3 rounded-full bg-primary"
          animate={
            still ? { opacity: 0 } : { left: ["0%", "0%", "88%", "88%"], opacity: [0, 1, 1, 0] }
          }
          transition={{ ...loop, times: [0, 0.4, 0.75, 0.85] }}
        />
        <m.span
          className="ml-2 flex items-center gap-1.5 rounded-full border border-primary bg-card px-2.5 py-1 font-semibold text-primary"
          animate={still ? undefined : { scale: [1, 1, 1.12, 1] }}
          transition={{ ...loop, times: [0, 0.74, 0.82, 0.92] }}
        >
          <UserRound className="size-3.5" />
          {you}
        </m.span>
      </div>
    </div>
  );
}

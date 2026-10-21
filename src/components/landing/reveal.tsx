import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Fades and lifts its content in as it scrolls into view. Pure CSS (scroll-driven
 * animations, see `[data-reveal]` in globals.css): no JavaScript, nothing hidden for
 * browsers without support or for visitors who ask for less motion.
 */
export function Reveal({
  children,
  className,
  late = false,
}: {
  children: ReactNode;
  className?: string;
  /** Starts a little later, so items in a row arrive one after another. */
  late?: boolean;
}) {
  return (
    <div data-reveal={late ? "late" : ""} className={cn(className)}>
      {children}
    </div>
  );
}

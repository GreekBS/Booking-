"use client";

import { cn } from "@/lib/utils";
import { copilotStrings } from "../lib/strings";
import styles from "./typing-dots.module.css";

export interface TypingDotsProps {
  className?: string;
}

/**
 * Messenger-style three-dot typing indicator (presentation only).
 * Motion respects `prefers-reduced-motion` via CSS.
 */
export function TypingDots({ className }: TypingDotsProps) {
  return (
    <div
      role="status"
      data-testid="copilot-thinking"
      aria-label={copilotStrings.thinking}
      className={cn("flex flex-col items-start gap-1", className)}
    >
      <span className="text-[11px] font-medium text-muted-foreground">
        {copilotStrings.assistantLabel}
      </span>
      <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-2.5">
        <span className="sr-only">{copilotStrings.thinking}</span>
        <span aria-hidden="true" className={styles.dot} />
        <span aria-hidden="true" className={styles.dot} />
        <span aria-hidden="true" className={styles.dot} />
      </div>
    </div>
  );
}

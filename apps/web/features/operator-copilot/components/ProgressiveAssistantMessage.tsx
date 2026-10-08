"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "../lib/prefers-reduced-motion";
import { copilotStrings } from "../lib/strings";

/** Hard cap for the reveal animation regardless of message length. */
export const PROGRESSIVE_REVEAL_MAX_MS = 1500;

export interface ProgressiveAssistantMessageProps {
  id: string;
  content: string;
  /** When false, show full content immediately (history / already revealed). */
  animate: boolean;
  /** Fired once when the reveal finishes or is skipped. */
  onRevealComplete?: (id: string) => void;
  className?: string;
}

/**
 * Client-only progressive reveal for a completed assistant string.
 * Does not delay API/persistence — `content` is already the full response.
 * Plain-text formatting (`whitespace-pre-wrap`) is preserved.
 */
export function ProgressiveAssistantMessage({
  id,
  content,
  animate,
  onRevealComplete,
  className,
}: ProgressiveAssistantMessageProps) {
  const reducedMotion = usePrefersReducedMotion();
  const shouldAnimate = animate && !reducedMotion && content.length > 0;
  const [visibleCount, setVisibleCount] = useState(
    shouldAnimate ? 0 : content.length,
  );
  const [done, setDone] = useState(!shouldAnimate);
  const skipRef = useRef(false);
  const completedRef = useRef(false);
  const contentRef = useRef(content);
  const onCompleteRef = useRef(onRevealComplete);
  contentRef.current = content;
  onCompleteRef.current = onRevealComplete;

  const notifyComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current?.(id);
  }, [id]);

  const finish = useCallback(() => {
    skipRef.current = true;
    setVisibleCount(contentRef.current.length);
    setDone(true);
    notifyComplete();
  }, [notifyComplete]);

  useEffect(() => {
    skipRef.current = false;
    completedRef.current = false;
    if (!shouldAnimate) {
      setVisibleCount(content.length);
      setDone(true);
      notifyComplete();
      return;
    }

    setVisibleCount(0);
    setDone(false);
    const total = content.length;
    const started = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      if (skipRef.current) return;
      const elapsed = now - started;
      const progress = Math.min(1, elapsed / PROGRESSIVE_REVEAL_MAX_MS);
      const next = Math.min(total, Math.floor(progress * total));
      setVisibleCount(next);
      if (progress >= 1 || next >= total) {
        setVisibleCount(total);
        setDone(true);
        notifyComplete();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [id, content, shouldAnimate, notifyComplete]);

  const shown = content.slice(0, visibleCount);

  return (
    <div
      data-testid="copilot-assistant-message"
      data-progressive-message={id}
      data-progressive-done={done ? "true" : "false"}
      className={cn(
        "max-w-[85%] whitespace-pre-wrap break-words rounded-lg border border-border bg-muted px-3 py-2 text-sm leading-relaxed text-foreground",
        !done && "cursor-pointer",
        className,
      )}
      onClick={!done ? finish : undefined}
      onKeyDown={
        !done
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                finish();
              }
            }
          : undefined
      }
      role={!done ? "button" : undefined}
      tabIndex={!done ? 0 : undefined}
      aria-label={!done ? copilotStrings.skipTyping : undefined}
      title={!done ? copilotStrings.skipTyping : undefined}
    >
      {/* Full text for AT while the visual reveal is in progress. */}
      {!done ? <span className="sr-only">{content}</span> : null}
      <span aria-hidden={!done}>{shown}</span>
      {!done ? (
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.1em] bg-foreground/50 align-baseline motion-reduce:hidden"
        />
      ) : null}
    </div>
  );
}

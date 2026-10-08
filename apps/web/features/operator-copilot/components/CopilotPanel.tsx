"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, SquarePen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { copilotStrings } from "../lib/strings";
import { ProgressiveAssistantMessage } from "./ProgressiveAssistantMessage";
import { TaliaPortrait } from "./TaliaPortrait";
import { TypingDots } from "./TypingDots";

export interface CopilotPanelMessage {
  id: string;
  role: "operator" | "assistant";
  content: string;
}

export interface CopilotPanelProps {
  messages: CopilotPanelMessage[];
  sending: boolean;
  loadingHistory?: boolean;
  error?: string | null;
  /** Active Property display name (context hint shown in the header). */
  propertyName?: string | null;
  /**
   * Assistant message ids that should progressive-reveal (newly arrived only).
   * History and previously revealed messages must not be listed here.
   */
  animateMessageIds?: ReadonlySet<string>;
  onRevealComplete?: (id: string) => void;
  /** Resolve `true` when the message was accepted (input is then cleared). */
  onSend: (text: string) => Promise<boolean>;
  onNewChat: () => void;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}

const MAX_INPUT_CHARS = 4000;
const EMPTY_ANIMATE_IDS: ReadonlySet<string> = new Set();

export function CopilotPanel({
  messages,
  sending,
  loadingHistory = false,
  error = null,
  propertyName = null,
  animateMessageIds = EMPTY_ANIMATE_IDS,
  onRevealComplete,
  onSend,
  onNewChat,
  onClose,
  className,
  style,
  inputRef,
}: CopilotPanelProps) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending, animateMessageIds]);

  const trimmed = draft.trim();
  const canSend = trimmed.length > 0 && !sending && !loadingHistory;

  async function submit() {
    if (!canSend) return;
    const text = trimmed;
    const accepted = await onSend(text);
    if (accepted) setDraft("");
  }

  return (
    <section
      role="dialog"
      aria-label={copilotStrings.panelLabel}
      data-testid="copilot-panel"
      style={style}
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-150 motion-reduce:animate-none",
        className,
      )}
    >
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <TaliaPortrait size={32} showOnline className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold leading-tight">
            {copilotStrings.productName}
          </h2>
          <p className="truncate text-xs italic text-muted-foreground">
            {copilotStrings.subtitle}
            {propertyName ? (
              <span className="not-italic">
                {" · "}
                {copilotStrings.activePropertyPrefix} {propertyName}
              </span>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={copilotStrings.newChat}
          title={copilotStrings.newChat}
          onClick={onNewChat}
        >
          <SquarePen />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={copilotStrings.close}
          title={copilotStrings.close}
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-label={copilotStrings.panelLabel}
        className="flex-1 space-y-3 overflow-y-auto bg-background/50 px-4 py-4"
      >
        {loadingHistory ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {copilotStrings.loadingHistory}
          </p>
        ) : messages.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-semibold">{copilotStrings.emptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {copilotStrings.emptyBody}
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              data-role={m.role}
              className={cn(
                "flex flex-col gap-1",
                m.role === "operator" ? "items-end" : "items-start",
              )}
            >
              <span className="text-[11px] font-medium text-muted-foreground">
                {m.role === "operator"
                  ? copilotStrings.operatorLabel
                  : copilotStrings.assistantLabel}
              </span>
              {m.role === "assistant" ? (
                <ProgressiveAssistantMessage
                  id={m.id}
                  content={m.content}
                  animate={animateMessageIds.has(m.id)}
                  onRevealComplete={onRevealComplete}
                />
              ) : (
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-relaxed",
                    "bg-primary text-primary-foreground",
                  )}
                >
                  {m.content}
                </div>
              )}
            </div>
          ))
        )}

        {sending ? <TypingDots /> : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      <form
        className="flex items-end gap-2 border-t border-border bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Textarea
          ref={inputRef}
          value={draft}
          rows={1}
          maxLength={MAX_INPUT_CHARS}
          aria-label={copilotStrings.inputLabel}
          placeholder={copilotStrings.inputPlaceholder}
          readOnly={sending}
          className="max-h-32 min-h-[40px] flex-1 resize-none py-2 text-sm"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          aria-label={copilotStrings.send}
          title={copilotStrings.send}
          disabled={!canSend}
        >
          <Send />
        </Button>
      </form>
    </section>
  );
}

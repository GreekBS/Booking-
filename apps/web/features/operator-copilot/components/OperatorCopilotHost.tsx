"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { useActiveProperty } from "@/hooks/use-active-property";
import { AdminApiError } from "@/lib/admin/api";
import {
  clampAvatarPosition,
  computePanelRect,
  loadAvatarPosition,
  writeStoredAvatarPosition,
  type AvatarPosition,
  type ViewportSize,
} from "../lib/avatar-position";
import { copilotStrings } from "../lib/strings";
import { useCopilotApi } from "../hooks/use-copilot-api";
import { useCopilotPageContext } from "../hooks/use-copilot-page-context";
import { CopilotAvatar } from "./CopilotAvatar";
import { CopilotPanel, type CopilotPanelMessage } from "./CopilotPanel";

const MOBILE_BREAKPOINT_PX = 640;
const CONVERSATION_STORAGE_PREFIX = "talos.copilot.conversation.v1";

function conversationStorageKey(tenantId: string, userId: string): string {
  return `${CONVERSATION_STORAGE_PREFIX}:${tenantId}:${userId}`;
}

function readStoredConversationId(tenantId: string, userId: string): string | null {
  try {
    return sessionStorage.getItem(conversationStorageKey(tenantId, userId));
  } catch {
    return null;
  }
}

function writeStoredConversationId(
  tenantId: string,
  userId: string,
  conversationId: string | null,
): void {
  try {
    const key = conversationStorageKey(tenantId, userId);
    if (conversationId) sessionStorage.setItem(key, conversationId);
    else sessionStorage.removeItem(key);
  } catch {
    /* sessionStorage unavailable: conversation simply won't survive a reload */
  }
}

function readViewport(): ViewportSize {
  return { width: window.innerWidth, height: window.innerHeight };
}

function isGoneConversationError(error: unknown): boolean {
  return (
    error instanceof AdminApiError &&
    (error.status === 404 || /archived/i.test(error.message))
  );
}

/**
 * Floating Operator Copilot launcher + panel for the admin shell.
 *
 * - Renders only for an authenticated operator with an active tenant.
 * - Identity is never sent from here; the server derives it from the session.
 * - Active Property and page context are hints, re-authorized server-side.
 */
export function OperatorCopilotHost() {
  const { tenantId, profile } = useTenant();
  const userId = profile?.user?.id ?? null;
  const { propertyId, property } = useActiveProperty();
  const pageContext = useCopilotPageContext();
  const api = useCopilotApi(tenantId);

  const [viewport, setViewport] = useState<ViewportSize | null>(null);
  const [position, setPosition] = useState<AvatarPosition | null>(null);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotPanelMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Newly arrived assistant message ids pending progressive reveal (never history). */
  const [animateMessageIds, setAnimateMessageIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const avatarRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const openRef = useRef(open);
  const sendingRef = useRef(false);
  const loadedConversationRef = useRef<string | null>(null);
  const wasOpenRef = useRef(false);
  openRef.current = open;

  // Initial viewport, stored avatar position and persisted conversation id.
  useEffect(() => {
    if (!tenantId || !userId) return;
    const vp = readViewport();
    setViewport(vp);
    setPosition(loadAvatarPosition(tenantId, userId, vp));
    setConversationId(readStoredConversationId(tenantId, userId));
    loadedConversationRef.current = null;
  }, [tenantId, userId]);

  // Keep the avatar inside the viewport on resize.
  useEffect(() => {
    function onResize() {
      const vp = readViewport();
      setViewport(vp);
      setPosition((prev) => (prev ? clampAvatarPosition(prev, vp) : prev));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Focus management: input on open, launcher on close.
  useEffect(() => {
    if (open) {
      setUnread(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 0);
      wasOpenRef.current = true;
      return () => clearTimeout(timer);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      avatarRef.current?.focus();
    }
    return undefined;
  }, [open]);

  const resetConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setAnimateMessageIds(new Set());
    loadedConversationRef.current = null;
    if (tenantId && userId) writeStoredConversationId(tenantId, userId, null);
  }, [tenantId, userId]);

  const handleRevealComplete = useCallback((id: string) => {
    setAnimateMessageIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Closing the panel cancels in-flight reveal; reopen shows full text.
  useEffect(() => {
    if (!open) setAnimateMessageIds(new Set());
  }, [open]);

  // Load the persisted conversation the first time the panel opens.
  useEffect(() => {
    if (!open || !api || !conversationId) return;
    if (loadedConversationRef.current === conversationId) return;
    loadedConversationRef.current = conversationId;
    let cancelled = false;
    setLoadingHistory(true);
    setError(null);
    api
      .getConversation(conversationId)
      .then(({ conversation, messages: history }) => {
        if (cancelled) return;
        if (conversation.status !== "active") {
          resetConversation();
          return;
        }
        setMessages(history);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isGoneConversationError(err)) {
          resetConversation();
        } else {
          setError(copilotStrings.loadError);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, api, conversationId, resetConversation]);

  const handleSend = useCallback(
    async (text: string): Promise<boolean> => {
      if (!api || !tenantId || !userId || sendingRef.current) return false;
      sendingRef.current = true;
      setSending(true);
      setError(null);

      const tempId = `local-${Date.now()}`;
      setMessages((prev) => [...prev, { id: tempId, role: "operator", content: text }]);

      try {
        let id = conversationId;
        if (!id) {
          const created = await api.createConversation({ activePropertyId: propertyId });
          id = created.id;
          loadedConversationRef.current = id;
          setConversationId(id);
          writeStoredConversationId(tenantId, userId, id);
        }

        const result = await api.sendMessage(id, {
          content: text,
          activePropertyId: propertyId,
          pageContext,
        });

        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => m.id !== tempId);
          return [
            ...withoutTemp,
            result.operatorMessage ?? { id: tempId, role: "operator", content: text },
            ...(result.assistantMessage ? [result.assistantMessage] : []),
          ];
        });
        if (result.assistantMessage) {
          const assistantId = result.assistantMessage.id;
          setAnimateMessageIds((prev) => new Set(prev).add(assistantId));
        }
        if (!openRef.current && result.assistantMessage) {
          setUnread((n) => n + 1);
        }
        return true;
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        if (isGoneConversationError(err)) resetConversation();
        setError(copilotStrings.genericError);
        return false;
      } finally {
        sendingRef.current = false;
        setSending(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    },
    [api, tenantId, userId, conversationId, propertyId, pageContext, resetConversation],
  );

  const handleNewChat = useCallback(() => {
    if (sendingRef.current) return;
    const previousId = conversationId;
    resetConversation();
    setError(null);
    setUnread(0);
    if (previousId && api) {
      // Best effort: a failed archive must not block starting fresh.
      api.archiveConversation(previousId).catch(() => undefined);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [api, conversationId, resetConversation]);

  const handlePositionCommit = useCallback(
    (next: AvatarPosition) => {
      setPosition(next);
      if (tenantId && userId) writeStoredAvatarPosition(tenantId, userId, next);
    },
    [tenantId, userId],
  );

  if (!tenantId || !userId || !viewport || !position) return null;

  const isMobile = viewport.width < MOBILE_BREAKPOINT_PX;
  const panelRect = isMobile ? null : computePanelRect(position, viewport);

  return (
    <div data-testid="operator-copilot-host" className="print:hidden">
      {open ? (
        <CopilotPanel
          messages={messages}
          sending={sending}
          loadingHistory={loadingHistory}
          error={error}
          propertyName={property?.name ?? null}
          animateMessageIds={animateMessageIds}
          onRevealComplete={handleRevealComplete}
          onSend={handleSend}
          onNewChat={handleNewChat}
          onClose={() => setOpen(false)}
          inputRef={inputRef}
          className={isMobile ? "inset-2" : undefined}
          style={
            panelRect
              ? {
                  left: panelRect.left,
                  top: panelRect.top,
                  width: panelRect.width,
                  height: panelRect.height,
                }
              : undefined
          }
        />
      ) : null}
      {/* On mobile the sheet covers the screen; the launcher returns on close. */}
      {!(isMobile && open) ? (
        <CopilotAvatar
          ref={avatarRef}
          position={position}
          viewport={viewport}
          open={open}
          unreadCount={unread}
          onPositionCommit={handlePositionCommit}
          onActivate={() => setOpen((v) => !v)}
        />
      ) : null}
    </div>
  );
}

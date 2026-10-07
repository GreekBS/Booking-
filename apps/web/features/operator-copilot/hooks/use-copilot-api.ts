"use client";

import { useMemo } from "react";
import { adminFetch } from "@/lib/admin/api";
import type { CopilotPageContext } from "../lib/page-context";

export interface CopilotConversationDto {
  id: string;
  title: string | null;
  status: "active" | "archived" | string;
  activePropertyId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotMessageDto {
  id: string;
  role: "operator" | "assistant";
  content: string;
  createdAt: string;
}

export interface CopilotSendResult {
  conversationId: string;
  operatorMessage: CopilotMessageDto | null;
  assistantMessage: CopilotMessageDto | null;
  toolCallCount: number;
  failed: boolean;
  errorCode: string | null;
}

export interface CopilotApi {
  createConversation(input?: {
    activePropertyId?: string | null;
  }): Promise<CopilotConversationDto>;
  listConversations(status?: "active" | "archived"): Promise<{
    conversations: CopilotConversationDto[];
  }>;
  getConversation(id: string): Promise<{
    conversation: CopilotConversationDto;
    messages: CopilotMessageDto[];
  }>;
  archiveConversation(id: string): Promise<{ conversation: CopilotConversationDto }>;
  sendMessage(
    id: string,
    input: {
      content: string;
      activePropertyId?: string | null;
      pageContext?: CopilotPageContext | null;
    },
  ): Promise<CopilotSendResult>;
}

/**
 * Thin fetch helpers over `/api/admin/v1/copilot/*`.
 * Identity is never sent: the server derives tenant/user/role from the session.
 * Only `X-Tenant-Id` (the active tenant routing header) is attached by adminFetch.
 */
export function createCopilotApi(tenantId: string): CopilotApi {
  const base = "/copilot/conversations";
  return {
    createConversation: (input) =>
      adminFetch<CopilotConversationDto>(base, {
        method: "POST",
        tenantId,
        body: JSON.stringify({
          activePropertyId: input?.activePropertyId ?? null,
        }),
      }),
    listConversations: (status) =>
      adminFetch(`${base}${status ? `?status=${status}` : ""}`, { tenantId }),
    getConversation: (id) =>
      adminFetch(`${base}/${encodeURIComponent(id)}`, { tenantId }),
    archiveConversation: (id) =>
      adminFetch(`${base}/${encodeURIComponent(id)}/archive`, {
        method: "POST",
        tenantId,
      }),
    sendMessage: (id, input) =>
      adminFetch<CopilotSendResult>(`${base}/${encodeURIComponent(id)}/messages`, {
        method: "POST",
        tenantId,
        body: JSON.stringify({
          content: input.content,
          activePropertyId: input.activePropertyId ?? null,
          pageContext: input.pageContext ?? null,
        }),
      }),
  };
}

export function useCopilotApi(tenantId: string | null): CopilotApi | null {
  return useMemo(() => (tenantId ? createCopilotApi(tenantId) : null), [tenantId]);
}

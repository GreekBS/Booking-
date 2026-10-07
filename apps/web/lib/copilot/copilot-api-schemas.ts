import { z } from "zod";
import type {
  CopilotConversationRecord,
  CopilotMessageRecord,
} from "@hcp/domain";
import { MAX_MESSAGE_CHARS } from "@hcp/domain";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/**
 * Client-supplied page hints. HINTS ONLY: the orchestrator and every tool
 * re-authorize each id. Unknown keys are stripped.
 */
export const copilotPageContextSchema = z.object({
  kind: z.enum([
    "dashboard",
    "calendar",
    "booking",
    "messages",
    "housekeeping",
    "generic",
  ]),
  propertyId: z.string().uuid().optional(),
  bookingId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
});

export const copilotIdParamSchema = z.string().uuid();

export const createCopilotConversationBodySchema = z.object({
  activePropertyId: z.string().uuid().nullish(),
  title: z.string().trim().max(120).nullish(),
});

export const listCopilotConversationsQuerySchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const sendCopilotMessageBodySchema = z.object({
  content: z.string().trim().min(1, "Message is required").max(MAX_MESSAGE_CHARS),
  activePropertyId: z.string().uuid().nullish(),
  pageContext: copilotPageContextSchema.nullish(),
});

export interface CopilotConversationDto {
  id: string;
  title: string | null;
  status: string;
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

/** tenantId / operatorUserId are intentionally not exposed to the client. */
export function toConversationDto(c: CopilotConversationRecord): CopilotConversationDto {
  return {
    id: c.id,
    title: c.title,
    status: c.status,
    activePropertyId: c.activePropertyId,
    lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toMessageDto(m: CopilotMessageRecord): CopilotMessageDto | null {
  // Tool traffic (minimized operational data) stays server-side.
  if (m.role !== "operator" && m.role !== "assistant") return null;
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  };
}

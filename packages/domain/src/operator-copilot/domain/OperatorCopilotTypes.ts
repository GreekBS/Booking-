/**
 * Operator Copilot V1 — read-only AI assistant for authenticated Talos operators.
 *
 * Distinct from the guest-facing messaging assistant: the operator is TRUSTED,
 * guest/provider message bodies are UNTRUSTED, and no write tools exist.
 */

export type CopilotConversationStatus = "active" | "archived";

export type CopilotMessageRole = "operator" | "assistant" | "tool";

export interface CopilotConversationRecord {
  id: string;
  tenantId: string;
  /** Owning operator (User.id). Conversations are private to this user. */
  operatorUserId: string;
  title: string | null;
  status: CopilotConversationStatus;
  /** Active Property at the time of the last turn (hint only; re-authorized per turn). */
  activePropertyId: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CopilotMessageRecord {
  id: string;
  tenantId: string;
  conversationId: string;
  role: CopilotMessageRole;
  /** Operator text, assistant text, or minimized tool result (never raw dumps). */
  content: string;
  /** Set for role === "tool". */
  toolName: string | null;
  /** Provider tool-call id for role === "tool". */
  toolCallId: string | null;
  createdAt: Date;
}

export type CopilotPageContextKind =
  | "dashboard"
  | "calendar"
  | "booking"
  | "messages"
  | "housekeeping"
  | "generic";

/**
 * Client-supplied page hints. These are HINTS only — every id is re-authorized
 * before use by any tool.
 */
export interface CopilotPageContext {
  kind: CopilotPageContextKind;
  propertyId?: string;
  bookingId?: string;
  conversationId?: string;
  unitId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Trusted Talos-derived operator context (from the authenticated session). */
export interface CopilotOperatorContext {
  userId: string;
  tenantId: string;
  role: string;
  /** null = tenant-wide scope; array = assigned-property scope. */
  propertyIds: string[] | null;
  isSuperAdmin?: boolean;
  activePropertyId: string | null;
  pageContext: CopilotPageContext | null;
}

/** `AiUsageRecord.operation` values written by the Operator Copilot. */
export const OPERATOR_COPILOT_OPS = {
  TURN: "operator_copilot_turn",
  TOOL: "operator_copilot_tool",
  /** One row per Gemini generateContent round (latency + http attempts). */
  ROUND: "operator_copilot_round",
} as const;

export type OperatorCopilotOp =
  (typeof OPERATOR_COPILOT_OPS)[keyof typeof OPERATOR_COPILOT_OPS];

/** Max prior messages loaded into a provider request. */
export const MAX_HISTORY_MESSAGES = 20;
/** Max tool executions per operator turn. */
export const MAX_TOOL_CALLS_PER_TURN = 4;
/** Max operator message length (characters). */
export const MAX_MESSAGE_CHARS = 4000;
/** Max serialized tool result size fed back to the model / persisted. */
export const MAX_TOOL_RESULT_CHARS = 6000;
/** Max bookings returned by search_bookings. */
export const MAX_BOOKING_SEARCH = 10;
/** Max calendar range (days) for get_calendar_snapshot. */
export const MAX_CALENDAR_DAYS = 31;
/** Max guest conversation messages surfaced by get_conversation_summary. */
export const MAX_CONVERSATION_MESSAGES = 12;
/** Max characters per guest conversation message body surfaced to the model. */
export const MAX_MESSAGE_BODY_CHARS = 500;
/** Provider call timeout (ms). Enforced by provider adapters. */
export const PROVIDER_TIMEOUT_MS = 20000;

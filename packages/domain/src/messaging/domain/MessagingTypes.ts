/**
 * Messaging + AI Guest Receptionist V1 — persistence-shaped DTOs.
 * Field names / enums align with packages/database Prisma schema.
 */

export const MESSAGING_CHANNELS = [
  "talos_direct",
  "whatsapp",
  "email",
  "booking_com",
  "airbnb",
  "expedia",
  "other",
] as const;
export type MessagingChannel = (typeof MESSAGING_CHANNELS)[number];

export const CONVERSATION_STATUSES = [
  "open",
  "waiting_guest",
  "waiting_operator",
  "resolved",
  "archived",
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export type MessageDirection = "inbound" | "outbound";

export const MESSAGE_SENDER_TYPES = [
  "guest",
  "operator",
  "assistant",
  "system",
] as const;
export type MessageSenderType = (typeof MESSAGE_SENDER_TYPES)[number];

export const DELIVERY_STATUSES = [
  "pending",
  "sent",
  "delivered",
  "failed",
  "local_only",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const ASSISTANT_MODES = ["off", "copilot", "autopilot"] as const;
export type AssistantMode = (typeof ASSISTANT_MODES)[number];

export const ASSISTANT_TONES = [
  "warm",
  "professional",
  "friendly",
  "luxury",
  "concise",
] as const;
export type AssistantTone = (typeof ASSISTANT_TONES)[number];

export const FORMALITY_LEVELS = ["informal", "neutral", "formal"] as const;
export type Formality = (typeof FORMALITY_LEVELS)[number];

export const EMOJI_POLICIES = ["none", "sparing", "allowed"] as const;
export type EmojiPolicy = (typeof EMOJI_POLICIES)[number];

export const REPLY_LENGTHS = ["short", "medium"] as const;
export type ReplyLength = (typeof REPLY_LENGTHS)[number];

export const ASSISTANT_CLASSIFICATIONS = [
  "ANSWERABLE",
  "UNKNOWN",
  "REQUIRES_OWNER_DECISION",
  "BLOCKED",
] as const;
export type AssistantClassification =
  (typeof ASSISTANT_CLASSIFICATIONS)[number];

export const AI_SUGGESTION_STATUSES = [
  "pending",
  "ready",
  "accepted",
  "edited",
  "rejected",
  "failed",
  "auto_sent",
] as const;
export type AiSuggestionStatus = (typeof AI_SUGGESTION_STATUSES)[number];

export const ESCALATION_STATUSES = [
  "open",
  "answered",
  "dismissed",
  "expired",
] as const;
export type EscalationStatus = (typeof ESCALATION_STATUSES)[number];

export const OWNER_ESCALATION_CLASSIFICATIONS = [
  "UNKNOWN",
  "REQUIRES_OWNER_DECISION",
  "BLOCKED",
] as const;
export type OwnerEscalationClassification =
  (typeof OWNER_ESCALATION_CLASSIFICATIONS)[number];

export type AssistantOperation = "classify_and_draft" | "polish_owner_decision";

/** Grounding source ids use `guest_knowledge.<field>` / `faq:<id>` / `policy.*`. */
export const PROPERTY_GUEST_KNOWLEDGE_FIELDS = [
  "guestFacingSummary",
  "earlyCheckInPolicy",
  "lateCheckoutPolicy",
  "directions",
  "parkingInfo",
  "accessInstructions",
  "wifiSsid",
  "wifiPassword",
  "poolInfo",
  "hvacInstructions",
  "applianceNotes",
  "amenityNotes",
  "houseRules",
  "smokingPolicy",
  "petsPolicy",
  "quietHours",
  "transportInfo",
  "taxiInfo",
  "beaches",
  "restaurants",
  "supermarkets",
  "recommendations",
  "guestFacingPhone",
  "guestFacingEmail",
  "emergencyContact",
] as const;
export type PropertyGuestKnowledgeField =
  (typeof PROPERTY_GUEST_KNOWLEDGE_FIELDS)[number];

export interface ConversationRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  guestId: string | null;
  bookingId: string | null;
  channel: MessagingChannel;
  externalThreadId: string | null;
  guestChannelIdentity: string | null;
  cswOpenUntil: Date | null;
  lastGuestInboundAt: Date | null;
  routingStatus: "ok" | "ambiguous" | "unmatched";
  status: ConversationStatus;
  subject: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  conversationId: string;
  direction: MessageDirection;
  senderType: MessageSenderType;
  body: string;
  deliveryStatus: DeliveryStatus;
  externalMessageId: string | null;
  createdByUserId: string | null;
  aiSuggestionId: string | null;
  createdAt: Date;
}

export interface PropertyAssistantProfileRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  enabled: boolean;
  mode: AssistantMode;
  tone: AssistantTone;
  formality: Formality;
  emojiPolicy: EmojiPolicy;
  useGuestFirstName: boolean;
  replyLength: ReplyLength;
  signOff: string | null;
  preferGuestLanguage: boolean;
  defaultLocale: string;
  customVoiceNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PropertyGuestKnowledgeRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  guestFacingSummary: string | null;
  earlyCheckInPolicy: string | null;
  lateCheckoutPolicy: string | null;
  directions: string | null;
  parkingInfo: string | null;
  accessInstructions: string | null;
  wifiSsid: string | null;
  wifiPassword: string | null;
  poolInfo: string | null;
  hvacInstructions: string | null;
  applianceNotes: string | null;
  amenityNotes: string | null;
  houseRules: string | null;
  smokingPolicy: string | null;
  petsPolicy: string | null;
  quietHours: string | null;
  transportInfo: string | null;
  taxiInfo: string | null;
  beaches: string | null;
  restaurants: string | null;
  supermarkets: string | null;
  recommendations: string | null;
  guestFacingPhone: string | null;
  guestFacingEmail: string | null;
  emergencyContact: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PropertyFaqItemRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiSuggestionRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  conversationId: string;
  sourceMessageId: string | null;
  provider: string;
  model: string;
  classification: AssistantClassification;
  status: AiSuggestionStatus;
  suggestedBody: string | null;
  escalationReason: string | null;
  escalationSummary: string | null;
  knowledgeSourceIds: string[];
  safetyFlags: string[];
  guestLanguage: string | null;
  contextFingerprint: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OwnerEscalationRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  conversationId: string;
  triggerMessageId: string;
  bookingId: string | null;
  guestId: string | null;
  classification: OwnerEscalationClassification;
  reason: string | null;
  summaryForOwner: string;
  status: EscalationStatus;
  ownerRawReply: string | null;
  answeredByUserId: string | null;
  answeredAt: Date | null;
  resultingSuggestionId: string | null;
  resultingMessageId: string | null;
  saveToKnowledgeOffered: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiUsageRecord {
  id: string;
  tenantId: string;
  propertyId: string | null;
  conversationId: string | null;
  provider: string;
  model: string;
  operation: string;
  classification: string | null;
  autoAnswered: boolean;
  escalated: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  success: boolean;
  errorCode: string | null;
  estimatedCostMinor: number | null;
  createdAt: Date;
}

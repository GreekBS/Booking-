import type {
  AssistantClassification,
  AssistantOperation,
  AssistantTone,
  EmojiPolicy,
  Formality,
  MessageDirection,
  MessageSenderType,
  PropertyGuestKnowledgeRecord,
  ReplyLength,
} from "../domain/MessagingTypes";

/**
 * Allow-listed context DTO handed to the model.
 * Never includes guest notes, payments/folio, fiscal, or credentials beyond guest Wi‑Fi.
 */

export interface AssistantContextAmenity {
  /** Amenity catalog id — grounding source is `amenity:{id}`. */
  id: string;
  /** Guest-facing display name. */
  name: string;
}

export interface AssistantContextProperty {
  id: string;
  name: string;
  type: string;
  description: string | null;
  checkInTime: string;
  checkOutTime: string;
  location: {
    addressLine: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
  };
  amenities: AssistantContextAmenity[];
}

export interface AssistantContextStyle {
  tone: AssistantTone;
  formality: Formality;
  emojiPolicy: EmojiPolicy;
  useGuestFirstName: boolean;
  replyLength: ReplyLength;
  signOff: string | null;
  preferGuestLanguage: boolean;
  defaultLocale: string;
  customVoiceNotes: string | null;
}

export interface AssistantContextStay {
  guestDisplayName: string | null;
  guestFirstName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  guestCount: number | null;
  bookingStatus: string | null;
}

export interface AssistantContextMessage {
  direction: MessageDirection;
  senderType: MessageSenderType;
  body: string;
  createdAt: string;
}

export interface AssistantContextFaq {
  id: string;
  question: string;
  answer: string;
}

/** Flat knowledge projection — mirrors PropertyGuestKnowledge without ids/timestamps. */
export type AssistantContextKnowledge = Omit<
  PropertyGuestKnowledgeRecord,
  "id" | "tenantId" | "propertyId" | "createdAt" | "updatedAt"
>;

export interface AssistantContext {
  property: AssistantContextProperty;
  knowledge: AssistantContextKnowledge | null;
  faqs: AssistantContextFaq[];
  style: AssistantContextStyle;
  stay: AssistantContextStay | null;
  recentMessages: AssistantContextMessage[];
}

export interface AssistantGenerateRequest {
  context: AssistantContext;
  inboundMessage: string;
  operation: AssistantOperation;
  ownerRawReply?: string;
}

export interface AssistantGenerateResult {
  classification: AssistantClassification;
  replyText: string | null;
  requiresEscalation: boolean;
  escalationReason: string | null;
  escalationSummary: string | null;
  unansweredTopics: string[];
  knowledgeSourceIds: string[];
  safetyFlags: string[];
  guestLanguage: string | null;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  success: boolean;
  errorCode: string | null;
}

export interface IAssistantProvider {
  generate(req: AssistantGenerateRequest): Promise<AssistantGenerateResult>;
}

/** Prefix for escalationReason / errorCode when the AI provider fails (not a knowledge gap). */
export const ASSISTANT_PROVIDER_FAILURE_PREFIX = "assistant_provider_failure";

export function amenitySourceId(amenityId: string): string {
  return `amenity:${amenityId}`;
}

export function isAssistantProviderFailureReason(
  reason: string | null | undefined,
): boolean {
  if (!reason) return false;
  return (
    reason === ASSISTANT_PROVIDER_FAILURE_PREFIX ||
    reason.startsWith(`${ASSISTANT_PROVIDER_FAILURE_PREFIX}:`) ||
    reason.startsWith("gemini_") ||
    reason.startsWith("http_") ||
    reason === "provider_exception" ||
    reason === "provider_error" ||
    reason === "ASSISTANT_PROVIDER_UNAVAILABLE"
  );
}

/**
 * Fail-closed AI result: no guest-facing draft, escalate for manual attention.
 * Classification stays non-ANSWERABLE for Autopilot gating; the reason encodes
 * infrastructure failure so it is not treated as a Property knowledge UNKNOWN.
 */
export function createAssistantProviderFailureResult(options: {
  errorCode: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
  operation?: AssistantOperation;
  ownerRawReply?: string;
}): AssistantGenerateResult {
  const code = options.errorCode.trim() || "unavailable";
  const reason = `${ASSISTANT_PROVIDER_FAILURE_PREFIX}:${code}`;
  // Polish may surface the owner's own words as a non-AI draft (success=false).
  const replyText =
    options.operation === "polish_owner_decision"
      ? (options.ownerRawReply ?? "").trim() || null
      : null;

  return {
    // Not a factual knowledge verdict — Autopilot must never send this.
    classification: "UNKNOWN",
    replyText,
    requiresEscalation: true,
    escalationReason: reason,
    escalationSummary:
      "AI assistant unavailable — inbound message retained for manual operator reply.",
    unansweredTopics: ["assistant_unavailable"],
    knowledgeSourceIds: [],
    safetyFlags: [],
    guestLanguage: null,
    provider: options.provider ?? "unavailable",
    model: options.model ?? "none",
    inputTokens: null,
    outputTokens: null,
    latencyMs: options.latencyMs ?? 0,
    success: false,
    errorCode: code,
  };
}

/**
 * Explicit null-object / fail-closed provider. Never invents Property answers.
 * Selected only when AI_ASSISTANT_PROVIDER=unavailable (or as Gemini failure path).
 */
export class UnavailableAssistantProvider implements IAssistantProvider {
  constructor(
    private readonly errorCode = "ASSISTANT_PROVIDER_UNAVAILABLE",
    private readonly providerName = "unavailable",
  ) {}

  async generate(
    req: AssistantGenerateRequest,
  ): Promise<AssistantGenerateResult> {
    return createAssistantProviderFailureResult({
      errorCode: this.errorCode,
      provider: this.providerName,
      operation: req.operation,
      ownerRawReply: req.ownerRawReply,
    });
  }
}

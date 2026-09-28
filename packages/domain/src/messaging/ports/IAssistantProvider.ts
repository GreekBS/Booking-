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
  amenityNames: string[];
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

export class UnavailableAssistantProvider implements IAssistantProvider {
  constructor(
    private readonly errorCode = "ASSISTANT_PROVIDER_UNAVAILABLE",
  ) {}

  async generate(
    req: AssistantGenerateRequest,
  ): Promise<AssistantGenerateResult> {
    const replyText =
      req.operation === "polish_owner_decision"
        ? (req.ownerRawReply ?? "").trim() || null
        : null;

    return {
      classification: "UNKNOWN",
      replyText,
      requiresEscalation: true,
      escalationReason: this.errorCode,
      escalationSummary: "Assistant unavailable — manual reply required.",
      unansweredTopics: [],
      knowledgeSourceIds: [],
      safetyFlags: [],
      guestLanguage: null,
      provider: "unavailable",
      model: "none",
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      success: false,
      errorCode: this.errorCode,
    };
  }
}

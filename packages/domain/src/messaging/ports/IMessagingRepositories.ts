import type {
  AiSuggestionRecord,
  AiSuggestionStatus,
  AiUsageRecord,
  ConversationRecord,
  ConversationStatus,
  MessageRecord,
  OwnerEscalationRecord,
  PropertyAssistantProfileRecord,
  PropertyFaqItemRecord,
  PropertyGuestKnowledgeRecord,
} from "../domain/MessagingTypes";

export interface IConversationRepository {
  create(input: ConversationRecord): Promise<ConversationRecord>;
  findById(tenantId: string, id: string): Promise<ConversationRecord | null>;
  listByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<ConversationRecord[]>;
  listByTenant(
    tenantId: string,
    allowedPropertyIds: string[] | null,
  ): Promise<ConversationRecord[]>;
  updateMeta(
    tenantId: string,
    id: string,
    patch: {
      status?: ConversationStatus;
      lastMessageAt?: Date;
      guestId?: string | null;
      bookingId?: string | null;
      guestChannelIdentity?: string | null;
      cswOpenUntil?: Date | null;
      lastGuestInboundAt?: Date | null;
      routingStatus?: "ok" | "ambiguous" | "unmatched";
      externalThreadId?: string | null;
    },
  ): Promise<ConversationRecord>;
  findOpenWhatsAppByIdentity(
    tenantId: string,
    guestChannelIdentity: string,
  ): Promise<ConversationRecord[]>;
}

export interface IMessageRepository {
  append(input: MessageRecord): Promise<MessageRecord>;
  listByConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<MessageRecord[]>;
  findById(tenantId: string, id: string): Promise<MessageRecord | null>;
  findByExternalMessageId(
    tenantId: string,
    externalMessageId: string,
  ): Promise<MessageRecord | null>;
  updateDelivery(
    tenantId: string,
    id: string,
    patch: {
      deliveryStatus: MessageRecord["deliveryStatus"];
      externalMessageId?: string | null;
    },
  ): Promise<MessageRecord>;
}

export interface IPropertyAssistantConfigRepository {
  getProfile(
    tenantId: string,
    propertyId: string,
  ): Promise<PropertyAssistantProfileRecord | null>;
  upsertProfile(
    input: PropertyAssistantProfileRecord,
  ): Promise<PropertyAssistantProfileRecord>;
  getKnowledge(
    tenantId: string,
    propertyId: string,
  ): Promise<PropertyGuestKnowledgeRecord | null>;
  upsertKnowledge(
    input: PropertyGuestKnowledgeRecord,
  ): Promise<PropertyGuestKnowledgeRecord>;
  listFaqs(
    tenantId: string,
    propertyId: string,
  ): Promise<PropertyFaqItemRecord[]>;
  replaceFaqs(params: {
    tenantId: string;
    propertyId: string;
    items: Array<{
      id: string;
      question: string;
      answer: string;
      sortOrder: number;
      isActive: boolean;
    }>;
  }): Promise<PropertyFaqItemRecord[]>;
}

export interface IAiSuggestionRepository {
  create(input: AiSuggestionRecord): Promise<AiSuggestionRecord>;
  updateStatus(
    tenantId: string,
    id: string,
    status: AiSuggestionStatus,
  ): Promise<AiSuggestionRecord>;
  findById(tenantId: string, id: string): Promise<AiSuggestionRecord | null>;
  listByConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<AiSuggestionRecord[]>;
}

export interface IOwnerEscalationRepository {
  createIfAbsent(
    input: OwnerEscalationRecord,
  ): Promise<{ record: OwnerEscalationRecord; created: boolean }>;
  findById(
    tenantId: string,
    id: string,
  ): Promise<OwnerEscalationRecord | null>;
  listOpenByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<OwnerEscalationRecord[]>;
  listOpenByTenant(
    tenantId: string,
    allowedPropertyIds: string[] | null,
  ): Promise<OwnerEscalationRecord[]>;
  resolve(
    tenantId: string,
    id: string,
    patch: {
      ownerRawReply: string;
      answeredByUserId: string;
      answeredAt: Date;
      resultingSuggestionId: string | null;
      resultingMessageId: string | null;
      saveToKnowledgeOffered: boolean;
      status: "answered";
    },
  ): Promise<OwnerEscalationRecord>;
}

export interface IAiUsageRepository {
  record(input: AiUsageRecord): Promise<AiUsageRecord>;
}

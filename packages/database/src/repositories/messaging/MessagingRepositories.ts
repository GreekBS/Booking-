import { randomUUID } from "node:crypto";
import type {
  AiSuggestionRecord,
  AiUsageRecord,
  ConversationRecord,
  MessageRecord,
  OwnerEscalationRecord,
  PropertyAssistantProfileRecord,
  PropertyFaqItemRecord,
  PropertyGuestKnowledgeRecord,
  IAiSuggestionRepository,
  IAiUsageRepository,
  IConversationRepository,
  IMessageRepository,
  IOwnerEscalationRepository,
  IPropertyAssistantConfigRepository,
} from "@hcp/domain";
import { withTenantTransaction } from "../../client";

function mapConversation(row: any): ConversationRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    guestId: row.guestId,
    bookingId: row.bookingId,
    channel: row.channel,
    externalThreadId: row.externalThreadId,
    guestChannelIdentity: row.guestChannelIdentity ?? null,
    cswOpenUntil: row.cswOpenUntil ?? null,
    lastGuestInboundAt: row.lastGuestInboundAt ?? null,
    routingStatus: row.routingStatus ?? "ok",
    status: row.status,
    subject: row.subject,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMessage(row: any): MessageRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    conversationId: row.conversationId,
    direction: row.direction,
    senderType: row.senderType,
    body: row.body,
    deliveryStatus: row.deliveryStatus,
    externalMessageId: row.externalMessageId,
    createdByUserId: row.createdByUserId,
    aiSuggestionId: row.aiSuggestionId,
    createdAt: row.createdAt,
  };
}

function mapProfile(row: any): PropertyAssistantProfileRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    enabled: row.enabled,
    mode: row.mode,
    tone: row.tone,
    formality: row.formality,
    emojiPolicy: row.emojiPolicy,
    useGuestFirstName: row.useGuestFirstName,
    replyLength: row.replyLength,
    signOff: row.signOff,
    preferGuestLanguage: row.preferGuestLanguage,
    defaultLocale: row.defaultLocale,
    customVoiceNotes: row.customVoiceNotes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapKnowledge(row: any): PropertyGuestKnowledgeRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    guestFacingSummary: row.guestFacingSummary,
    earlyCheckInPolicy: row.earlyCheckInPolicy,
    lateCheckoutPolicy: row.lateCheckoutPolicy,
    directions: row.directions,
    parkingInfo: row.parkingInfo,
    accessInstructions: row.accessInstructions,
    wifiSsid: row.wifiSsid,
    wifiPassword: row.wifiPassword,
    poolInfo: row.poolInfo,
    hvacInstructions: row.hvacInstructions,
    applianceNotes: row.applianceNotes,
    amenityNotes: row.amenityNotes,
    houseRules: row.houseRules,
    smokingPolicy: row.smokingPolicy,
    petsPolicy: row.petsPolicy,
    quietHours: row.quietHours,
    transportInfo: row.transportInfo,
    taxiInfo: row.taxiInfo,
    beaches: row.beaches,
    restaurants: row.restaurants,
    supermarkets: row.supermarkets,
    recommendations: row.recommendations,
    guestFacingPhone: row.guestFacingPhone,
    guestFacingEmail: row.guestFacingEmail,
    emergencyContact: row.emergencyContact,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapFaq(row: any): PropertyFaqItemRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    question: row.question,
    answer: row.answer,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSuggestion(row: any): AiSuggestionRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    conversationId: row.conversationId,
    sourceMessageId: row.sourceMessageId,
    provider: row.provider,
    model: row.model,
    classification: row.classification,
    status: row.status,
    suggestedBody: row.suggestedBody,
    escalationReason: row.escalationReason,
    escalationSummary: row.escalationSummary,
    knowledgeSourceIds: row.knowledgeSourceIds ?? [],
    safetyFlags: row.safetyFlags ?? [],
    guestLanguage: row.guestLanguage,
    contextFingerprint: row.contextFingerprint,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEscalation(row: any): OwnerEscalationRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    conversationId: row.conversationId,
    triggerMessageId: row.triggerMessageId,
    bookingId: row.bookingId,
    guestId: row.guestId,
    classification: row.classification,
    reason: row.reason,
    summaryForOwner: row.summaryForOwner,
    status: row.status,
    ownerRawReply: row.ownerRawReply,
    answeredByUserId: row.answeredByUserId,
    answeredAt: row.answeredAt,
    resultingSuggestionId: row.resultingSuggestionId,
    resultingMessageId: row.resultingMessageId,
    saveToKnowledgeOffered: row.saveToKnowledgeOffered,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaConversationRepository implements IConversationRepository {
  async create(input: ConversationRecord): Promise<ConversationRecord> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.conversation.create({
        data: {
          id: input.id,
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          guestId: input.guestId,
          bookingId: input.bookingId,
          channel: input.channel,
          externalThreadId: input.externalThreadId,
          guestChannelIdentity: input.guestChannelIdentity ?? null,
          cswOpenUntil: input.cswOpenUntil ?? null,
          lastGuestInboundAt: input.lastGuestInboundAt ?? null,
          routingStatus: input.routingStatus ?? "ok",
          status: input.status,
          subject: input.subject,
          lastMessageAt: input.lastMessageAt,
        },
      });
      return mapConversation(row);
    });
  }

  async findById(tenantId: string, id: string): Promise<ConversationRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.conversation.findFirst({ where: { id, tenantId } });
      return row ? mapConversation(row) : null;
    });
  }

  async listByProperty(tenantId: string, propertyId: string): Promise<ConversationRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.conversation.findMany({
        where: { tenantId, propertyId },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      });
      return rows.map(mapConversation);
    });
  }

  async listByTenant(
    tenantId: string,
    allowedPropertyIds: string[] | null,
  ): Promise<ConversationRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.conversation.findMany({
        where: {
          tenantId,
          ...(allowedPropertyIds
            ? { propertyId: { in: allowedPropertyIds } }
            : {}),
        },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      });
      return rows.map(mapConversation);
    });
  }

  async updateMeta(
    tenantId: string,
    id: string,
    patch: {
      status?: ConversationRecord["status"];
      lastMessageAt?: Date;
      guestId?: string | null;
      bookingId?: string | null;
      guestChannelIdentity?: string | null;
      cswOpenUntil?: Date | null;
      lastGuestInboundAt?: Date | null;
      routingStatus?: "ok" | "ambiguous" | "unmatched";
      externalThreadId?: string | null;
    },
  ): Promise<ConversationRecord> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.conversation.update({
        where: { id },
        data: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.lastMessageAt !== undefined
            ? { lastMessageAt: patch.lastMessageAt }
            : {}),
          ...(patch.guestId !== undefined ? { guestId: patch.guestId } : {}),
          ...(patch.bookingId !== undefined ? { bookingId: patch.bookingId } : {}),
          ...(patch.guestChannelIdentity !== undefined
            ? { guestChannelIdentity: patch.guestChannelIdentity }
            : {}),
          ...(patch.cswOpenUntil !== undefined
            ? { cswOpenUntil: patch.cswOpenUntil }
            : {}),
          ...(patch.lastGuestInboundAt !== undefined
            ? { lastGuestInboundAt: patch.lastGuestInboundAt }
            : {}),
          ...(patch.routingStatus !== undefined
            ? { routingStatus: patch.routingStatus }
            : {}),
          ...(patch.externalThreadId !== undefined
            ? { externalThreadId: patch.externalThreadId }
            : {}),
        },
      });
      return mapConversation(row);
    });
  }

  async findOpenWhatsAppByIdentity(
    tenantId: string,
    guestChannelIdentity: string,
  ): Promise<ConversationRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.conversation.findMany({
        where: {
          tenantId,
          channel: "whatsapp",
          guestChannelIdentity,
          status: { in: ["open", "waiting_guest", "waiting_operator"] },
        },
        orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      });
      return rows.map(mapConversation);
    });
  }
}

export class PrismaMessageRepository implements IMessageRepository {
  async append(input: MessageRecord): Promise<MessageRecord> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.message.create({
        data: {
          id: input.id,
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          conversationId: input.conversationId,
          direction: input.direction,
          senderType: input.senderType,
          body: input.body,
          deliveryStatus: input.deliveryStatus,
          externalMessageId: input.externalMessageId,
          createdByUserId: input.createdByUserId,
          aiSuggestionId: input.aiSuggestionId,
          createdAt: input.createdAt,
        },
      });
      return mapMessage(row);
    });
  }

  async listByConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<MessageRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.message.findMany({
        where: { tenantId, conversationId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(mapMessage);
    });
  }

  async findById(tenantId: string, id: string): Promise<MessageRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.message.findFirst({ where: { id, tenantId } });
      return row ? mapMessage(row) : null;
    });
  }

  async findByExternalMessageId(
    tenantId: string,
    externalMessageId: string,
  ): Promise<MessageRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.message.findFirst({
        where: { tenantId, externalMessageId },
      });
      return row ? mapMessage(row) : null;
    });
  }

  async updateDelivery(
    tenantId: string,
    id: string,
    patch: {
      deliveryStatus: MessageRecord["deliveryStatus"];
      externalMessageId?: string | null;
    },
  ): Promise<MessageRecord> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.message.update({
        where: { id },
        data: {
          deliveryStatus: patch.deliveryStatus,
          ...(patch.externalMessageId !== undefined
            ? { externalMessageId: patch.externalMessageId }
            : {}),
        },
      });
      return mapMessage(row);
    });
  }
}

export class PrismaPropertyAssistantConfigRepository
  implements IPropertyAssistantConfigRepository
{
  async getProfile(
    tenantId: string,
    propertyId: string,
  ): Promise<PropertyAssistantProfileRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.propertyAssistantProfile.findFirst({
        where: { tenantId, propertyId },
      });
      return row ? mapProfile(row) : null;
    });
  }

  async upsertProfile(
    input: PropertyAssistantProfileRecord,
  ): Promise<PropertyAssistantProfileRecord> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.propertyAssistantProfile.upsert({
        where: { propertyId: input.propertyId },
        create: {
          id: input.id,
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          enabled: input.enabled,
          mode: input.mode,
          tone: input.tone,
          formality: input.formality,
          emojiPolicy: input.emojiPolicy,
          useGuestFirstName: input.useGuestFirstName,
          replyLength: input.replyLength,
          signOff: input.signOff,
          preferGuestLanguage: input.preferGuestLanguage,
          defaultLocale: input.defaultLocale,
          customVoiceNotes: input.customVoiceNotes,
        },
        update: {
          enabled: input.enabled,
          mode: input.mode,
          tone: input.tone,
          formality: input.formality,
          emojiPolicy: input.emojiPolicy,
          useGuestFirstName: input.useGuestFirstName,
          replyLength: input.replyLength,
          signOff: input.signOff,
          preferGuestLanguage: input.preferGuestLanguage,
          defaultLocale: input.defaultLocale,
          customVoiceNotes: input.customVoiceNotes,
        },
      });
      return mapProfile(row);
    });
  }

  async getKnowledge(
    tenantId: string,
    propertyId: string,
  ): Promise<PropertyGuestKnowledgeRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.propertyGuestKnowledge.findFirst({
        where: { tenantId, propertyId },
      });
      return row ? mapKnowledge(row) : null;
    });
  }

  async upsertKnowledge(
    input: PropertyGuestKnowledgeRecord,
  ): Promise<PropertyGuestKnowledgeRecord> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const data = {
        guestFacingSummary: input.guestFacingSummary,
        earlyCheckInPolicy: input.earlyCheckInPolicy,
        lateCheckoutPolicy: input.lateCheckoutPolicy,
        directions: input.directions,
        parkingInfo: input.parkingInfo,
        accessInstructions: input.accessInstructions,
        wifiSsid: input.wifiSsid,
        wifiPassword: input.wifiPassword,
        poolInfo: input.poolInfo,
        hvacInstructions: input.hvacInstructions,
        applianceNotes: input.applianceNotes,
        amenityNotes: input.amenityNotes,
        houseRules: input.houseRules,
        smokingPolicy: input.smokingPolicy,
        petsPolicy: input.petsPolicy,
        quietHours: input.quietHours,
        transportInfo: input.transportInfo,
        taxiInfo: input.taxiInfo,
        beaches: input.beaches,
        restaurants: input.restaurants,
        supermarkets: input.supermarkets,
        recommendations: input.recommendations,
        guestFacingPhone: input.guestFacingPhone,
        guestFacingEmail: input.guestFacingEmail,
        emergencyContact: input.emergencyContact,
      };
      const row = await tx.propertyGuestKnowledge.upsert({
        where: { propertyId: input.propertyId },
        create: {
          id: input.id,
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          ...data,
        },
        update: data,
      });
      return mapKnowledge(row);
    });
  }

  async listFaqs(
    tenantId: string,
    propertyId: string,
  ): Promise<PropertyFaqItemRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.propertyFaqItem.findMany({
        where: { tenantId, propertyId },
        orderBy: { sortOrder: "asc" },
      });
      return rows.map(mapFaq);
    });
  }

  async replaceFaqs(params: {
    tenantId: string;
    propertyId: string;
    items: Array<{
      id: string;
      question: string;
      answer: string;
      sortOrder: number;
      isActive: boolean;
    }>;
  }): Promise<PropertyFaqItemRecord[]> {
    const { tenantId, propertyId, items } = params;
    return withTenantTransaction(tenantId, async (tx) => {
      await tx.propertyFaqItem.deleteMany({ where: { tenantId, propertyId } });
      if (items.length === 0) return [];
      await tx.propertyFaqItem.createMany({
        data: items.map((item) => ({
          id: item.id,
          tenantId,
          propertyId,
          question: item.question,
          answer: item.answer,
          sortOrder: item.sortOrder,
          isActive: item.isActive,
        })),
      });
      const rows = await tx.propertyFaqItem.findMany({
        where: { tenantId, propertyId },
        orderBy: { sortOrder: "asc" },
      });
      return rows.map(mapFaq);
    });
  }
}

export class PrismaAiSuggestionRepository implements IAiSuggestionRepository {
  async create(input: AiSuggestionRecord): Promise<AiSuggestionRecord> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.aiSuggestion.create({
        data: {
          id: input.id,
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          conversationId: input.conversationId,
          sourceMessageId: input.sourceMessageId,
          provider: input.provider,
          model: input.model,
          classification: input.classification,
          status: input.status,
          suggestedBody: input.suggestedBody,
          escalationReason: input.escalationReason,
          escalationSummary: input.escalationSummary,
          knowledgeSourceIds: input.knowledgeSourceIds,
          safetyFlags: input.safetyFlags,
          guestLanguage: input.guestLanguage,
          contextFingerprint: input.contextFingerprint,
        },
      });
      return mapSuggestion(row);
    });
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: AiSuggestionRecord["status"],
  ): Promise<AiSuggestionRecord> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.aiSuggestion.update({
        where: { id },
        data: { status },
      });
      return mapSuggestion(row);
    });
  }

  async findById(tenantId: string, id: string): Promise<AiSuggestionRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.aiSuggestion.findFirst({ where: { id, tenantId } });
      return row ? mapSuggestion(row) : null;
    });
  }

  async listByConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<AiSuggestionRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.aiSuggestion.findMany({
        where: { tenantId, conversationId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapSuggestion);
    });
  }
}

export class PrismaOwnerEscalationRepository implements IOwnerEscalationRepository {
  async createIfAbsent(
    input: OwnerEscalationRecord,
  ): Promise<{ record: OwnerEscalationRecord; created: boolean }> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const existing = await tx.ownerEscalation.findUnique({
        where: { triggerMessageId: input.triggerMessageId },
      });
      if (existing) {
        return { record: mapEscalation(existing), created: false };
      }
      try {
        const row = await tx.ownerEscalation.create({
          data: {
            id: input.id,
            tenantId: input.tenantId,
            propertyId: input.propertyId,
            conversationId: input.conversationId,
            triggerMessageId: input.triggerMessageId,
            bookingId: input.bookingId,
            guestId: input.guestId,
            classification: input.classification,
            reason: input.reason,
            summaryForOwner: input.summaryForOwner,
            status: input.status,
            ownerRawReply: input.ownerRawReply,
            answeredByUserId: input.answeredByUserId,
            answeredAt: input.answeredAt,
            resultingSuggestionId: input.resultingSuggestionId,
            resultingMessageId: input.resultingMessageId,
            saveToKnowledgeOffered: input.saveToKnowledgeOffered,
          },
        });
        return { record: mapEscalation(row), created: true };
      } catch {
        const again = await tx.ownerEscalation.findUnique({
          where: { triggerMessageId: input.triggerMessageId },
        });
        if (again) return { record: mapEscalation(again), created: false };
        throw new Error("Failed to create owner escalation");
      }
    });
  }

  async findById(tenantId: string, id: string): Promise<OwnerEscalationRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.ownerEscalation.findFirst({ where: { id, tenantId } });
      return row ? mapEscalation(row) : null;
    });
  }

  async listOpenByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<OwnerEscalationRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.ownerEscalation.findMany({
        where: { tenantId, propertyId, status: "open" },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapEscalation);
    });
  }

  async listOpenByTenant(
    tenantId: string,
    allowedPropertyIds: string[] | null,
  ): Promise<OwnerEscalationRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.ownerEscalation.findMany({
        where: {
          tenantId,
          status: "open",
          ...(allowedPropertyIds
            ? { propertyId: { in: allowedPropertyIds } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapEscalation);
    });
  }

  async resolve(
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
  ): Promise<OwnerEscalationRecord> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.ownerEscalation.update({
        where: { id },
        data: {
          ownerRawReply: patch.ownerRawReply,
          answeredByUserId: patch.answeredByUserId,
          answeredAt: patch.answeredAt,
          resultingSuggestionId: patch.resultingSuggestionId,
          resultingMessageId: patch.resultingMessageId,
          saveToKnowledgeOffered: patch.saveToKnowledgeOffered,
          status: patch.status,
        },
      });
      return mapEscalation(row);
    });
  }
}

export class PrismaAiUsageRepository implements IAiUsageRepository {
  async record(input: AiUsageRecord): Promise<AiUsageRecord> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.aiUsageRecord.create({
        data: {
          id: input.id || randomUUID(),
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          conversationId: input.conversationId,
          provider: input.provider,
          model: input.model,
          operation: input.operation,
          classification: input.classification,
          autoAnswered: input.autoAnswered,
          escalated: input.escalated,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          latencyMs: input.latencyMs,
          success: input.success,
          errorCode: input.errorCode,
          estimatedCostMinor: input.estimatedCostMinor,
        },
      });
      return {
        id: row.id,
        tenantId: row.tenantId,
        propertyId: row.propertyId,
        conversationId: row.conversationId,
        provider: row.provider,
        model: row.model,
        operation: row.operation,
        classification: row.classification,
        autoAnswered: row.autoAnswered,
        escalated: row.escalated,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        latencyMs: row.latencyMs,
        success: row.success,
        errorCode: row.errorCode,
        estimatedCostMinor: row.estimatedCostMinor,
        createdAt: row.createdAt,
      };
    });
  }
}

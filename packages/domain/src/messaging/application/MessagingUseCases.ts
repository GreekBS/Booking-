import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type {
  ActorContext,
  PermissionChecker,
} from "../../shared/services/PermissionChecker";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { IPropertyRepository } from "../../catalog/ports/ICatalogRepositories";
import type {
  AiSuggestionRecord,
  AiSuggestionStatus,
  AiUsageRecord,
  AssistantMode,
  ConversationRecord,
  MessageRecord,
  OwnerEscalationClassification,
  OwnerEscalationRecord,
  PropertyAssistantProfileRecord,
  PropertyFaqItemRecord,
  PropertyGuestKnowledgeRecord,
} from "../domain/MessagingTypes";
import type {
  IAiSuggestionRepository,
  IAiUsageRepository,
  IConversationRepository,
  IMessageRepository,
  IOwnerEscalationRepository,
  IPropertyAssistantConfigRepository,
} from "../ports/IMessagingRepositories";
import type {
  AssistantContext,
  IAssistantProvider,
} from "../ports/IAssistantProvider";
import {
  buildAssistantContext,
  toAssistantPropertySnapshot,
  type AssistantStayInput,
} from "./AssistantContextBuilder";
import { assertGroundedAnswerable, shouldAutoSend } from "./AssistantPolicy";
import {
  canManageAssistantConfigOnProperty,
  canReadMessagingOnProperty,
  canWriteMessagingOnProperty,
  resolveMessagingListScope,
} from "./messagingAccess";

export interface MessagingAuditContext {
  ipAddress?: string | null;
}

export const MAX_MESSAGE_BODY_LENGTH = 8000;
export const ASSISTANT_HISTORY_LIMIT = 20;
export const MAX_FAQ_ITEMS = 50;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function resolveAssistantMode(
  profile: PropertyAssistantProfileRecord | null,
): AssistantMode {
  if (!profile || !profile.enabled) return "off";
  return profile.mode;
}

function defaultProfile(
  id: string,
  tenantId: string,
  propertyId: string,
): PropertyAssistantProfileRecord {
  const now = new Date();
  return {
    id,
    tenantId,
    propertyId,
    enabled: false,
    mode: "off",
    tone: "warm",
    formality: "neutral",
    emojiPolicy: "sparing",
    useGuestFirstName: true,
    replyLength: "medium",
    signOff: null,
    preferGuestLanguage: true,
    defaultLocale: "el",
    customVoiceNotes: null,
    createdAt: now,
    updatedAt: now,
  };
}

function emptyKnowledge(
  id: string,
  tenantId: string,
  propertyId: string,
): PropertyGuestKnowledgeRecord {
  const now = new Date();
  return {
    id,
    tenantId,
    propertyId,
    guestFacingSummary: null,
    earlyCheckInPolicy: null,
    lateCheckoutPolicy: null,
    directions: null,
    parkingInfo: null,
    accessInstructions: null,
    wifiSsid: null,
    wifiPassword: null,
    poolInfo: null,
    hvacInstructions: null,
    applianceNotes: null,
    amenityNotes: null,
    houseRules: null,
    smokingPolicy: null,
    petsPolicy: null,
    quietHours: null,
    transportInfo: null,
    taxiInfo: null,
    beaches: null,
    restaurants: null,
    supermarkets: null,
    recommendations: null,
    guestFacingPhone: null,
    guestFacingEmail: null,
    emergencyContact: null,
    createdAt: now,
    updatedAt: now,
  };
}

function toEscalationClassification(
  c: string,
): OwnerEscalationClassification {
  if (c === "REQUIRES_OWNER_DECISION" || c === "BLOCKED") return c;
  return "UNKNOWN";
}

export class GetPropertyAssistantConfigUseCase {
  constructor(
    private readonly config: IPropertyAssistantConfigRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    input: { tenantId: string; propertyId: string },
    actor: ActorContext,
  ): Promise<
    Result<
      {
        profile: PropertyAssistantProfileRecord;
        knowledge: PropertyGuestKnowledgeRecord | null;
        faqs: PropertyFaqItemRecord[];
      },
      Error
    >
  > {
    try {
      if (
        !canManageAssistantConfigOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        ) &&
        !canReadMessagingOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      let profile = await this.config.getProfile(
        input.tenantId,
        input.propertyId,
      );
      if (!profile) {
        profile = await this.config.upsertProfile(
          defaultProfile(
            this.idGenerator.generate(),
            input.tenantId,
            input.propertyId,
          ),
        );
      }
      const knowledge = await this.config.getKnowledge(
        input.tenantId,
        input.propertyId,
      );
      const faqs = await this.config.listFaqs(
        input.tenantId,
        input.propertyId,
      );
      return Result.ok({ profile, knowledge, faqs });
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export class UpsertPropertyAssistantProfileUseCase {
  constructor(
    private readonly config: IPropertyAssistantConfigRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      propertyId: string;
      enabled?: boolean;
      mode?: AssistantMode;
      tone?: PropertyAssistantProfileRecord["tone"];
      formality?: PropertyAssistantProfileRecord["formality"];
      emojiPolicy?: PropertyAssistantProfileRecord["emojiPolicy"];
      useGuestFirstName?: boolean;
      replyLength?: PropertyAssistantProfileRecord["replyLength"];
      signOff?: string | null;
      preferGuestLanguage?: boolean;
      defaultLocale?: string;
      customVoiceNotes?: string | null;
    },
    actor: ActorContext,
  ): Promise<Result<PropertyAssistantProfileRecord, Error>> {
    try {
      if (
        !canManageAssistantConfigOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      const existing = await this.config.getProfile(
        input.tenantId,
        input.propertyId,
      );
      const base =
        existing ??
        defaultProfile(
          this.idGenerator.generate(),
          input.tenantId,
          input.propertyId,
        );
      const saved = await this.config.upsertProfile({
        ...base,
        enabled: input.enabled ?? base.enabled,
        mode: input.mode ?? base.mode,
        tone: input.tone ?? base.tone,
        formality: input.formality ?? base.formality,
        emojiPolicy: input.emojiPolicy ?? base.emojiPolicy,
        useGuestFirstName: input.useGuestFirstName ?? base.useGuestFirstName,
        replyLength: input.replyLength ?? base.replyLength,
        signOff:
          input.signOff === undefined
            ? base.signOff
            : input.signOff?.trim().slice(0, 120) || null,
        preferGuestLanguage:
          input.preferGuestLanguage ?? base.preferGuestLanguage,
        defaultLocale: input.defaultLocale ?? base.defaultLocale,
        customVoiceNotes:
          input.customVoiceNotes === undefined
            ? base.customVoiceNotes
            : input.customVoiceNotes?.trim().slice(0, 500) || null,
      });
      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "assistant.profile_upserted",
        resourceType: "property_assistant_profile",
        resourceId: saved.id,
        metadata: {
          propertyId: input.propertyId,
          mode: saved.mode,
          enabled: saved.enabled,
        },
        ipAddress: null,
      });
      return Result.ok(saved);
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export class UpsertPropertyGuestKnowledgeUseCase {
  constructor(
    private readonly config: IPropertyAssistantConfigRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      propertyId: string;
      patch: Partial<
        Omit<
          PropertyGuestKnowledgeRecord,
          "id" | "tenantId" | "propertyId" | "createdAt" | "updatedAt"
        >
      >;
    },
    actor: ActorContext,
  ): Promise<Result<PropertyGuestKnowledgeRecord, Error>> {
    try {
      if (
        !canManageAssistantConfigOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      const existing = await this.config.getKnowledge(
        input.tenantId,
        input.propertyId,
      );
      const base =
        existing ??
        emptyKnowledge(
          this.idGenerator.generate(),
          input.tenantId,
          input.propertyId,
        );
      const saved = await this.config.upsertKnowledge({
        ...base,
        ...input.patch,
        id: base.id,
        tenantId: input.tenantId,
        propertyId: input.propertyId,
      });
      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "assistant.knowledge_upserted",
        resourceType: "property_guest_knowledge",
        resourceId: saved.id,
        metadata: { propertyId: input.propertyId },
        ipAddress: null,
      });
      return Result.ok(saved);
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export class ReplacePropertyFaqsUseCase {
  constructor(
    private readonly config: IPropertyAssistantConfigRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      propertyId: string;
      faqs: Array<{
        id?: string;
        question: string;
        answer: string;
        sortOrder?: number;
        isActive?: boolean;
      }>;
    },
    actor: ActorContext,
  ): Promise<Result<PropertyFaqItemRecord[], Error>> {
    try {
      if (
        !canManageAssistantConfigOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      if (input.faqs.length > MAX_FAQ_ITEMS) {
        return Result.fail(new ValidationError("Too many FAQ items"));
      }
      const items = input.faqs.map((f, i) => ({
        id: f.id?.trim() || this.idGenerator.generate(),
        question: f.question.trim().slice(0, 500),
        answer: f.answer.trim().slice(0, 4000),
        sortOrder: f.sortOrder ?? i,
        isActive: f.isActive ?? true,
      }));
      const saved = await this.config.replaceFaqs({
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        items,
      });
      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "assistant.faqs_replaced",
        resourceType: "property_faq",
        resourceId: input.propertyId,
        metadata: { count: saved.length },
        ipAddress: null,
      });
      return Result.ok(saved);
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export class CreateConversationUseCase {
  constructor(
    private readonly conversations: IConversationRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly properties: IPropertyRepository,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      propertyId: string;
      guestId?: string | null;
      bookingId?: string | null;
      subject?: string | null;
      channel?: ConversationRecord["channel"];
    },
    actor: ActorContext,
  ): Promise<Result<ConversationRecord, Error>> {
    try {
      if (
        !canWriteMessagingOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      const property = await this.properties.findById(
        input.tenantId,
        input.propertyId,
      );
      if (!property || property.deletedAt) {
        return Result.fail(new NotFoundError("Property", input.propertyId));
      }
      const now = new Date();
      const conversation = await this.conversations.create({
        id: this.idGenerator.generate(),
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        guestId: input.guestId ?? null,
        bookingId: input.bookingId ?? null,
        channel: input.channel ?? "talos_direct",
        externalThreadId: null,
        status: "open",
        subject: input.subject?.trim().slice(0, 255) || null,
        lastMessageAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "messaging.conversation_created",
        resourceType: "conversation",
        resourceId: conversation.id,
        metadata: { propertyId: input.propertyId, channel: conversation.channel },
        ipAddress: null,
      });
      return Result.ok(conversation);
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export class ListConversationsUseCase {
  constructor(
    private readonly conversations: IConversationRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: {
      tenantId: string;
      propertyId?: string | null;
      entireTenant?: boolean;
    },
    actor: ActorContext,
  ): Promise<Result<ConversationRecord[], Error>> {
    try {
      const scope = resolveMessagingListScope(
        this.permissionChecker,
        actor,
        input.tenantId,
        { propertyId: input.propertyId, entireTenant: input.entireTenant },
      );
      if (scope === "forbidden") {
        return Result.fail(new ForbiddenError());
      }
      if (scope.propertyId) {
        return Result.ok(
          await this.conversations.listByProperty(
            input.tenantId,
            scope.propertyId,
          ),
        );
      }
      return Result.ok(
        await this.conversations.listByTenant(
          input.tenantId,
          scope.allowedPropertyIds,
        ),
      );
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export class GetConversationThreadUseCase {
  constructor(
    private readonly conversations: IConversationRepository,
    private readonly messages: IMessageRepository,
    private readonly suggestions: IAiSuggestionRepository,
    private readonly escalations: IOwnerEscalationRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; conversationId: string },
    actor: ActorContext,
  ): Promise<
    Result<
      {
        conversation: ConversationRecord;
        messages: MessageRecord[];
        suggestions: AiSuggestionRecord[];
        openEscalations: OwnerEscalationRecord[];
      },
      Error
    >
  > {
    try {
      const conversation = await this.conversations.findById(
        input.tenantId,
        input.conversationId,
      );
      if (!conversation) {
        return Result.fail(
          new NotFoundError("Conversation", input.conversationId),
        );
      }
      if (
        !canReadMessagingOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          conversation.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      const [messages, suggestions, openEscalations] = await Promise.all([
        this.messages.listByConversation(
          input.tenantId,
          conversation.id,
        ),
        this.suggestions.listByConversation(
          input.tenantId,
          conversation.id,
        ),
        this.escalations.listOpenByProperty(
          input.tenantId,
          conversation.propertyId,
        ),
      ]);
      return Result.ok({
        conversation,
        messages,
        suggestions,
        openEscalations: openEscalations.filter(
          (e) => e.conversationId === conversation.id,
        ),
      });
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export class SendOperatorMessageUseCase {
  constructor(
    private readonly conversations: IConversationRepository,
    private readonly messages: IMessageRepository,
    private readonly suggestions: IAiSuggestionRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      conversationId: string;
      body: string;
      aiSuggestionId?: string | null;
      suggestionStatus?: AiSuggestionStatus;
    },
    actor: ActorContext,
    auditContext?: MessagingAuditContext,
  ): Promise<Result<MessageRecord, Error>> {
    try {
      const body = input.body.trim();
      if (!body) {
        return Result.fail(new ValidationError("Message body is required"));
      }
      if (body.length > MAX_MESSAGE_BODY_LENGTH) {
        return Result.fail(new ValidationError("Message body is too long"));
      }
      const conversation = await this.conversations.findById(
        input.tenantId,
        input.conversationId,
      );
      if (!conversation) {
        return Result.fail(
          new NotFoundError("Conversation", input.conversationId),
        );
      }
      if (
        !canWriteMessagingOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          conversation.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      const now = new Date();
      const message = await this.messages.append({
        id: this.idGenerator.generate(),
        tenantId: input.tenantId,
        propertyId: conversation.propertyId,
        conversationId: conversation.id,
        direction: "outbound",
        senderType: "operator",
        body,
        deliveryStatus: "sent",
        externalMessageId: null,
        createdByUserId: actor.userId,
        aiSuggestionId: input.aiSuggestionId?.trim() || null,
        createdAt: now,
      });
      await this.conversations.updateMeta(input.tenantId, conversation.id, {
        lastMessageAt: now,
        status: "waiting_guest",
      });
      if (input.aiSuggestionId) {
        await this.suggestions.updateStatus(
          input.tenantId,
          input.aiSuggestionId,
          input.suggestionStatus ?? "accepted",
        );
      }
      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "messaging.operator_message_sent",
        resourceType: "message",
        resourceId: message.id,
        metadata: {
          conversationId: conversation.id,
          propertyId: conversation.propertyId,
          aiSuggestionId: message.aiSuggestionId,
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });
      return Result.ok(message);
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export interface IngestGuestMessageInput {
  tenantId: string;
  conversationId: string;
  body: string;
  externalMessageId?: string | null;
  stay?: AssistantStayInput | null;
  amenityNames?: string[];
}

export interface IngestGuestMessageResult {
  conversation: ConversationRecord;
  inboundMessage: MessageRecord;
  suggestion: AiSuggestionRecord | null;
  sentMessage: MessageRecord | null;
  escalation: OwnerEscalationRecord | null;
  autoSent: boolean;
}

export class IngestGuestMessageUseCase {
  constructor(
    private readonly conversations: IConversationRepository,
    private readonly messages: IMessageRepository,
    private readonly config: IPropertyAssistantConfigRepository,
    private readonly suggestions: IAiSuggestionRepository,
    private readonly escalations: IOwnerEscalationRepository,
    private readonly usage: IAiUsageRepository,
    private readonly properties: IPropertyRepository,
    private readonly assistant: IAssistantProvider,
    private readonly ids: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: IngestGuestMessageInput,
    actor: ActorContext,
    auditContext?: MessagingAuditContext,
  ): Promise<Result<IngestGuestMessageResult, Error>> {
    try {
      const body = input.body.trim();
      if (!body) {
        return Result.fail(new ValidationError("Message body is required"));
      }
      if (body.length > MAX_MESSAGE_BODY_LENGTH) {
        return Result.fail(new ValidationError("Message body is too long"));
      }

      const conversation = await this.conversations.findById(
        input.tenantId,
        input.conversationId,
      );
      if (!conversation) {
        return Result.fail(
          new NotFoundError("Conversation", input.conversationId),
        );
      }
      if (
        !canWriteMessagingOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          conversation.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const now = new Date();
      const inboundMessage = await this.messages.append({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        propertyId: conversation.propertyId,
        conversationId: conversation.id,
        direction: "inbound",
        senderType: "guest",
        body,
        deliveryStatus: "delivered",
        externalMessageId: input.externalMessageId?.trim() || null,
        createdByUserId: null,
        aiSuggestionId: null,
        createdAt: now,
      });

      let touched = await this.conversations.updateMeta(
        input.tenantId,
        conversation.id,
        { lastMessageAt: now, status: "open" },
      );

      const profile = await this.config.getProfile(
        input.tenantId,
        conversation.propertyId,
      );
      const mode = resolveAssistantMode(profile);
      if (mode === "off" || !profile) {
        return Result.ok({
          conversation: touched,
          inboundMessage,
          suggestion: null,
          sentMessage: null,
          escalation: null,
          autoSent: false,
        });
      }

      const context = await this.buildContext(
        input,
        conversation.propertyId,
        conversation.id,
        profile,
      );
      if (context.isFailure) {
        return Result.fail(context.getError());
      }

      let generated;
      try {
        generated = await this.assistant.generate({
          context: context.getValue(),
          inboundMessage: body,
          operation: "classify_and_draft",
        });
      } catch {
        generated = {
          classification: "UNKNOWN" as const,
          replyText: null,
          requiresEscalation: true,
          escalationReason: "provider_error",
          escalationSummary:
            "AI provider failed — inbound message retained for manual reply.",
          unansweredTopics: [],
          knowledgeSourceIds: [] as string[],
          safetyFlags: [] as string[],
          guestLanguage: null,
          provider: "error",
          model: "none",
          inputTokens: null,
          outputTokens: null,
          latencyMs: 0,
          success: false,
          errorCode: "provider_exception",
        };
      }

      const grounding = assertGroundedAnswerable({
        classification: generated.classification,
        replyText: generated.replyText ?? "",
        knowledgeSourceIds: generated.knowledgeSourceIds,
      });
      const classification = grounding.classification;

      const autoSend =
        generated.success &&
        !!generated.replyText?.trim() &&
        !generated.requiresEscalation &&
        shouldAutoSend(
          mode,
          classification,
          generated.knowledgeSourceIds,
          generated.safetyFlags,
        );

      const suggestionId = this.ids.generate();
      let status: AiSuggestionStatus = "ready";
      if (autoSend) status = "auto_sent";
      else if (!generated.success) status = "failed";
      else if (classification !== "ANSWERABLE") status = "pending";

      // Persist suggestion before any outbound message that references it (FK).
      const suggestion = await this.suggestions.create({
        id: suggestionId,
        tenantId: input.tenantId,
        propertyId: conversation.propertyId,
        conversationId: conversation.id,
        sourceMessageId: inboundMessage.id,
        provider: generated.provider,
        model: generated.model,
        classification,
        status,
        suggestedBody: generated.replyText,
        escalationReason: generated.escalationReason,
        escalationSummary:
          generated.escalationSummary ?? grounding.reason,
        knowledgeSourceIds: generated.knowledgeSourceIds,
        safetyFlags: generated.safetyFlags,
        guestLanguage: generated.guestLanguage,
        contextFingerprint: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      let sentMessage: MessageRecord | null = null;
      if (autoSend && generated.replyText) {
        sentMessage = await this.messages.append({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          propertyId: conversation.propertyId,
          conversationId: conversation.id,
          direction: "outbound",
          senderType: "assistant",
          body: generated.replyText.trim(),
          deliveryStatus: "sent",
          externalMessageId: null,
          createdByUserId: null,
          aiSuggestionId: suggestionId,
          createdAt: new Date(),
        });
        touched = await this.conversations.updateMeta(
          input.tenantId,
          conversation.id,
          { lastMessageAt: new Date(), status: "waiting_guest" },
        );
      }

      await this.usage.record({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        propertyId: conversation.propertyId,
        conversationId: conversation.id,
        provider: generated.provider,
        model: generated.model,
        operation: "classify_and_draft",
        classification,
        autoAnswered: autoSend,
        escalated: false,
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
        latencyMs: generated.latencyMs,
        success: generated.success,
        errorCode: generated.errorCode,
        estimatedCostMinor: null,
        createdAt: new Date(),
      });

      let escalation: OwnerEscalationRecord | null = null;
      const needsEscalation =
        !autoSend &&
        (classification !== "ANSWERABLE" ||
          generated.requiresEscalation ||
          !generated.success);

      if (needsEscalation) {
        const created = await this.escalations.createIfAbsent({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          propertyId: conversation.propertyId,
          conversationId: conversation.id,
          triggerMessageId: inboundMessage.id,
          bookingId: conversation.bookingId,
          guestId: conversation.guestId,
          classification: toEscalationClassification(classification),
          reason: generated.escalationReason,
          summaryForOwner:
            generated.escalationSummary?.trim() ||
            grounding.reason ||
            body.slice(0, 280),
          status: "open",
          ownerRawReply: null,
          answeredByUserId: null,
          answeredAt: null,
          resultingSuggestionId: suggestion.id,
          resultingMessageId: null,
          saveToKnowledgeOffered: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        escalation = created.record;
        touched = await this.conversations.updateMeta(
          input.tenantId,
          conversation.id,
          { status: "waiting_operator" },
        );
        await this.usage.record({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          propertyId: conversation.propertyId,
          conversationId: conversation.id,
          provider: generated.provider,
          model: generated.model,
          operation: "escalation_mark",
          classification,
          autoAnswered: false,
          escalated: true,
          inputTokens: null,
          outputTokens: null,
          latencyMs: 0,
          success: true,
          errorCode: null,
          estimatedCostMinor: null,
          createdAt: new Date(),
        });
      }

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: autoSend
          ? "messaging.assistant_auto_replied"
          : "messaging.assistant_suggested",
        resourceType: "ai_suggestion",
        resourceId: suggestion.id,
        metadata: {
          conversationId: conversation.id,
          propertyId: conversation.propertyId,
          classification,
          mode,
          downgraded: grounding.downgraded,
          escalationId: escalation?.id ?? null,
          success: generated.success,
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok({
        conversation: touched,
        inboundMessage,
        suggestion,
        sentMessage,
        escalation,
        autoSent: autoSend,
      });
    } catch (error) {
      return Result.fail(toError(error));
    }
  }

  private async buildContext(
    input: IngestGuestMessageInput,
    propertyId: string,
    conversationId: string,
    profile: PropertyAssistantProfileRecord,
  ): Promise<Result<AssistantContext, Error>> {
    const property = await this.properties.findById(input.tenantId, propertyId);
    if (!property) {
      return Result.fail(new NotFoundError("Property", propertyId));
    }
    const [knowledge, faqs, history] = await Promise.all([
      this.config.getKnowledge(input.tenantId, propertyId),
      this.config.listFaqs(input.tenantId, propertyId),
      this.messages.listByConversation(input.tenantId, conversationId),
    ]);
    return Result.ok(
      buildAssistantContext({
        property: toAssistantPropertySnapshot(property),
        profile,
        knowledge,
        faqs,
        amenityNames: input.amenityNames ?? [],
        stay: input.stay ?? null,
        messages: history.slice(-ASSISTANT_HISTORY_LIMIT),
      }),
    );
  }
}

export class ListOpenEscalationsUseCase {
  constructor(
    private readonly escalations: IOwnerEscalationRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: {
      tenantId: string;
      propertyId?: string | null;
      entireTenant?: boolean;
    },
    actor: ActorContext,
  ): Promise<Result<OwnerEscalationRecord[], Error>> {
    try {
      const scope = resolveMessagingListScope(
        this.permissionChecker,
        actor,
        input.tenantId,
        { propertyId: input.propertyId, entireTenant: input.entireTenant },
      );
      if (scope === "forbidden") {
        return Result.fail(new ForbiddenError());
      }
      if (scope.propertyId) {
        return Result.ok(
          await this.escalations.listOpenByProperty(
            input.tenantId,
            scope.propertyId,
          ),
        );
      }
      return Result.ok(
        await this.escalations.listOpenByTenant(
          input.tenantId,
          scope.allowedPropertyIds,
        ),
      );
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export interface ResolveOwnerEscalationResult {
  escalation: OwnerEscalationRecord;
  draftText: string;
  sentMessage: MessageRecord | null;
  saveToKnowledgeOffered: boolean;
}

export class ResolveOwnerEscalationUseCase {
  constructor(
    private readonly escalations: IOwnerEscalationRepository,
    private readonly conversations: IConversationRepository,
    private readonly messages: IMessageRepository,
    private readonly config: IPropertyAssistantConfigRepository,
    private readonly suggestions: IAiSuggestionRepository,
    private readonly usage: IAiUsageRepository,
    private readonly properties: IPropertyRepository,
    private readonly assistant: IAssistantProvider,
    private readonly ids: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      escalationId: string;
      ownerReply: string;
      /** Default: send when autopilot, draft-only for copilot. */
      send?: boolean;
      stay?: AssistantStayInput | null;
      amenityNames?: string[];
    },
    actor: ActorContext,
    auditContext?: MessagingAuditContext,
  ): Promise<Result<ResolveOwnerEscalationResult, Error>> {
    try {
      const ownerReply = input.ownerReply.trim();
      if (!ownerReply) {
        return Result.fail(new ValidationError("Owner reply is required"));
      }
      const escalation = await this.escalations.findById(
        input.tenantId,
        input.escalationId,
      );
      if (!escalation) {
        return Result.fail(
          new NotFoundError("Owner escalation", input.escalationId),
        );
      }
      if (escalation.status !== "open") {
        return Result.fail(
          new ConflictError(`Escalation is already ${escalation.status}`),
        );
      }
      if (
        !canWriteMessagingOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          escalation.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const conversation = await this.conversations.findById(
        input.tenantId,
        escalation.conversationId,
      );
      if (!conversation) {
        return Result.fail(
          new NotFoundError("Conversation", escalation.conversationId),
        );
      }

      const profile =
        (await this.config.getProfile(
          input.tenantId,
          escalation.propertyId,
        )) ??
        defaultProfile(
          this.ids.generate(),
          input.tenantId,
          escalation.propertyId,
        );

      const property = await this.properties.findById(
        input.tenantId,
        escalation.propertyId,
      );
      if (!property) {
        return Result.fail(
          new NotFoundError("Property", escalation.propertyId),
        );
      }

      const [knowledge, faqs, history, trigger] = await Promise.all([
        this.config.getKnowledge(input.tenantId, escalation.propertyId),
        this.config.listFaqs(input.tenantId, escalation.propertyId),
        this.messages.listByConversation(
          input.tenantId,
          conversation.id,
        ),
        this.messages.findById(input.tenantId, escalation.triggerMessageId),
      ]);

      const context = buildAssistantContext({
        property: toAssistantPropertySnapshot(property),
        profile,
        knowledge,
        faqs,
        amenityNames: input.amenityNames ?? [],
        stay: input.stay ?? null,
        messages: history.slice(-ASSISTANT_HISTORY_LIMIT),
      });

      const polished = await this.assistant.generate({
        context,
        inboundMessage: trigger?.body ?? escalation.summaryForOwner,
        operation: "polish_owner_decision",
        ownerRawReply: ownerReply,
      });

      await this.usage.record({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        propertyId: escalation.propertyId,
        conversationId: conversation.id,
        provider: polished.provider,
        model: polished.model,
        operation: "polish_owner_decision",
        classification: polished.classification,
        autoAnswered: false,
        escalated: false,
        inputTokens: polished.inputTokens,
        outputTokens: polished.outputTokens,
        latencyMs: polished.latencyMs,
        success: polished.success,
        errorCode: polished.errorCode,
        estimatedCostMinor: null,
        createdAt: new Date(),
      });

      const draftText =
        polished.replyText?.trim() || ownerReply;

      const mode = resolveAssistantMode(profile);
      const shouldSend =
        input.send ?? (mode === "autopilot" || mode === "off");

      let sentMessage: MessageRecord | null = null;
      let resultingSuggestionId: string | null = null;

      if (shouldSend) {
        const suggestionId = this.ids.generate();
        resultingSuggestionId = suggestionId;
        await this.suggestions.create({
          id: suggestionId,
          tenantId: input.tenantId,
          propertyId: escalation.propertyId,
          conversationId: conversation.id,
          sourceMessageId: escalation.triggerMessageId,
          provider: polished.provider,
          model: polished.model,
          classification: "ANSWERABLE",
          status: "accepted",
          suggestedBody: draftText,
          escalationReason: null,
          escalationSummary: null,
          knowledgeSourceIds: ["owner_decision"],
          safetyFlags: [],
          guestLanguage: polished.guestLanguage,
          contextFingerprint: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        sentMessage = await this.messages.append({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          propertyId: escalation.propertyId,
          conversationId: conversation.id,
          direction: "outbound",
          senderType: "assistant",
          body: draftText,
          deliveryStatus: "sent",
          externalMessageId: null,
          // Operator identity is on the escalation (answeredByUserId), not the
          // guest-facing message row — avoids requiring a User FK for AI polish.
          createdByUserId: null,
          aiSuggestionId: suggestionId,
          createdAt: new Date(),
        });
        await this.conversations.updateMeta(
          input.tenantId,
          conversation.id,
          { lastMessageAt: new Date(), status: "waiting_guest" },
        );
      }

      const saveToKnowledgeOffered =
        escalation.classification === "UNKNOWN";

      const resolved = await this.escalations.resolve(
        input.tenantId,
        escalation.id,
        {
          ownerRawReply: ownerReply,
          answeredByUserId: actor.userId,
          answeredAt: new Date(),
          resultingSuggestionId,
          resultingMessageId: sentMessage?.id ?? null,
          saveToKnowledgeOffered,
          status: "answered",
        },
      );

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "messaging.escalation_resolved",
        resourceType: "owner_escalation",
        resourceId: resolved.id,
        metadata: {
          conversationId: conversation.id,
          sent: !!sentMessage,
          saveToKnowledgeOffered,
          // Never log Wi-Fi or owner raw reply body
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok({
        escalation: resolved,
        draftText,
        sentMessage,
        saveToKnowledgeOffered,
      });
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

export class SaveEscalationToKnowledgeUseCase {
  constructor(
    private readonly escalations: IOwnerEscalationRepository,
    private readonly config: IPropertyAssistantConfigRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      escalationId: string;
      /** Editable proposed knowledge patch — operator must confirm. */
      patch: Partial<
        Omit<
          PropertyGuestKnowledgeRecord,
          "id" | "tenantId" | "propertyId" | "createdAt" | "updatedAt"
        >
      >;
      confirm: boolean;
    },
    actor: ActorContext,
  ): Promise<Result<PropertyGuestKnowledgeRecord | null, Error>> {
    try {
      if (!input.confirm) {
        return Result.fail(
          new ValidationError("Explicit confirmation required"),
        );
      }
      const escalation = await this.escalations.findById(
        input.tenantId,
        input.escalationId,
      );
      if (!escalation) {
        return Result.fail(
          new NotFoundError("Owner escalation", input.escalationId),
        );
      }
      if (
        !canManageAssistantConfigOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          escalation.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      if (!escalation.saveToKnowledgeOffered) {
        return Result.fail(
          new ValidationError("Save-to-Knowledge was not offered"),
        );
      }

      const existing = await this.config.getKnowledge(
        input.tenantId,
        escalation.propertyId,
      );
      const base =
        existing ??
        emptyKnowledge(
          this.idGenerator.generate(),
          input.tenantId,
          escalation.propertyId,
        );
      const saved = await this.config.upsertKnowledge({
        ...base,
        ...input.patch,
        id: base.id,
        tenantId: input.tenantId,
        propertyId: escalation.propertyId,
      });

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "assistant.knowledge_saved_from_escalation",
        resourceType: "property_guest_knowledge",
        resourceId: saved.id,
        metadata: {
          escalationId: escalation.id,
          propertyId: escalation.propertyId,
          fields: Object.keys(input.patch),
        },
        ipAddress: null,
      });

      return Result.ok(saved);
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

/** Re-export for metering typing convenience. */
export type { AiUsageRecord };

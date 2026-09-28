import { describe, expect, it } from "vitest";
import { Property } from "../../src/catalog/domain/Property";
import type { IPropertyRepository } from "../../src/catalog/ports/ICatalogRepositories";
import { ValidationError } from "../../src/shared/errors/DomainError";
import type { IIdGenerator } from "../../src/shared/ports/IIdGenerator";
import {
  PermissionChecker,
  type ActorContext,
} from "../../src/shared/services/PermissionChecker";
import type {
  AiSuggestionRecord,
  AiSuggestionStatus,
  AiUsageRecord,
  AssistantMode,
  ConversationRecord,
  ConversationStatus,
  MessageRecord,
  OwnerEscalationRecord,
  PropertyAssistantProfileRecord,
  PropertyFaqItemRecord,
  PropertyGuestKnowledgeRecord,
} from "../../src/messaging/domain/MessagingTypes";
import type {
  IAiSuggestionRepository,
  IAiUsageRepository,
  IConversationRepository,
  IMessageRepository,
  IOwnerEscalationRepository,
  IPropertyAssistantConfigRepository,
} from "../../src/messaging/ports/IMessagingRepositories";
import type {
  AssistantGenerateRequest,
  AssistantGenerateResult,
  IAssistantProvider,
} from "../../src/messaging/ports/IAssistantProvider";
import { UnavailableAssistantProvider } from "../../src/messaging/ports/IAssistantProvider";
import {
  CreateConversationUseCase,
  IngestGuestMessageUseCase,
  ListOpenEscalationsUseCase,
  ResolveOwnerEscalationUseCase,
  SaveEscalationToKnowledgeUseCase,
  SendOperatorMessageUseCase,
  UpsertPropertyAssistantProfileUseCase,
  UpsertPropertyGuestKnowledgeUseCase,
} from "../../src/messaging/application/MessagingUseCases";

const TENANT = "tenant-1";
const PROPERTY = "prop-1";

const admin: ActorContext = {
  userId: "user-admin",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: false,
};

class SequentialIdGenerator implements IIdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

class InMemoryConversationRepository implements IConversationRepository {
  readonly rows: ConversationRecord[] = [];

  async create(input: ConversationRecord): Promise<ConversationRecord> {
    this.rows.push({ ...input });
    return { ...input };
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<ConversationRecord | null> {
    const row = this.find(tenantId, id);
    return row ? { ...row } : null;
  }

  async listByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<ConversationRecord[]> {
    return this.rows
      .filter((row) => row.tenantId === tenantId && row.propertyId === propertyId)
      .map((row) => ({ ...row }));
  }

  async listByTenant(
    tenantId: string,
    allowedPropertyIds: string[] | null,
  ): Promise<ConversationRecord[]> {
    return this.rows
      .filter(
        (row) =>
          row.tenantId === tenantId &&
          (allowedPropertyIds === null ||
            allowedPropertyIds.includes(row.propertyId)),
      )
      .map((row) => ({ ...row }));
  }

  async updateMeta(
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
  ): Promise<ConversationRecord> {
    const row = this.find(tenantId, id);
    if (!row) {
      throw new Error(`Conversation not found: ${id}`);
    }
    if (patch.status) row.status = patch.status;
    if (patch.lastMessageAt) row.lastMessageAt = patch.lastMessageAt;
    if (patch.guestId !== undefined) row.guestId = patch.guestId;
    if (patch.bookingId !== undefined) row.bookingId = patch.bookingId;
    if (patch.guestChannelIdentity !== undefined)
      row.guestChannelIdentity = patch.guestChannelIdentity;
    if (patch.cswOpenUntil !== undefined) row.cswOpenUntil = patch.cswOpenUntil;
    if (patch.lastGuestInboundAt !== undefined)
      row.lastGuestInboundAt = patch.lastGuestInboundAt;
    if (patch.routingStatus !== undefined) row.routingStatus = patch.routingStatus;
    if (patch.externalThreadId !== undefined)
      row.externalThreadId = patch.externalThreadId;
    row.updatedAt = new Date();
    return { ...row };
  }

  async findOpenWhatsAppByIdentity(
    tenantId: string,
    guestChannelIdentity: string,
  ): Promise<ConversationRecord[]> {
    return this.rows
      .filter(
        (row) =>
          row.tenantId === tenantId &&
          row.channel === "whatsapp" &&
          row.guestChannelIdentity === guestChannelIdentity &&
          ["open", "waiting_guest", "waiting_operator"].includes(row.status),
      )
      .map((row) => ({ ...row }));
  }

  private find(tenantId: string, id: string): ConversationRecord | undefined {
    return this.rows.find(
      (row) => row.tenantId === tenantId && row.id === id,
    );
  }
}

class InMemoryMessageRepository implements IMessageRepository {
  readonly rows: MessageRecord[] = [];

  async append(input: MessageRecord): Promise<MessageRecord> {
    this.rows.push({ ...input });
    return { ...input };
  }

  async listByConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<MessageRecord[]> {
    return this.rows
      .filter(
        (row) =>
          row.tenantId === tenantId && row.conversationId === conversationId,
      )
      .map((row) => ({ ...row }));
  }

  async findById(tenantId: string, id: string): Promise<MessageRecord | null> {
    const row = this.rows.find(
      (candidate) => candidate.tenantId === tenantId && candidate.id === id,
    );
    return row ? { ...row } : null;
  }

  async findByExternalMessageId(
    tenantId: string,
    externalMessageId: string,
  ): Promise<MessageRecord | null> {
    const row = this.rows.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.externalMessageId === externalMessageId,
    );
    return row ? { ...row } : null;
  }

  async updateDelivery(
    tenantId: string,
    id: string,
    patch: {
      deliveryStatus: MessageRecord["deliveryStatus"];
      externalMessageId?: string | null;
    },
  ): Promise<MessageRecord> {
    const row = this.rows.find(
      (candidate) => candidate.tenantId === tenantId && candidate.id === id,
    );
    if (!row) throw new Error("missing message");
    row.deliveryStatus = patch.deliveryStatus;
    if (patch.externalMessageId !== undefined) {
      row.externalMessageId = patch.externalMessageId;
    }
    return { ...row };
  }
}

class InMemoryAssistantConfigRepository
  implements IPropertyAssistantConfigRepository
{
  private profile: PropertyAssistantProfileRecord | null = null;
  private knowledge: PropertyGuestKnowledgeRecord | null = null;
  private faqs: PropertyFaqItemRecord[] = [];

  async getProfile(): Promise<PropertyAssistantProfileRecord | null> {
    return this.profile ? { ...this.profile } : null;
  }

  async upsertProfile(
    input: PropertyAssistantProfileRecord,
  ): Promise<PropertyAssistantProfileRecord> {
    this.profile = { ...input, updatedAt: new Date() };
    return { ...this.profile };
  }

  async getKnowledge(): Promise<PropertyGuestKnowledgeRecord | null> {
    return this.knowledge ? { ...this.knowledge } : null;
  }

  async upsertKnowledge(
    input: PropertyGuestKnowledgeRecord,
  ): Promise<PropertyGuestKnowledgeRecord> {
    this.knowledge = { ...input, updatedAt: new Date() };
    return { ...this.knowledge };
  }

  async listFaqs(): Promise<PropertyFaqItemRecord[]> {
    return this.faqs.map((faq) => ({ ...faq }));
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
    const now = new Date();
    this.faqs = params.items.map((item) => ({
      ...item,
      tenantId: params.tenantId,
      propertyId: params.propertyId,
      createdAt: now,
      updatedAt: now,
    }));
    return this.faqs.map((faq) => ({ ...faq }));
  }
}

class InMemoryAiSuggestionRepository implements IAiSuggestionRepository {
  readonly rows: AiSuggestionRecord[] = [];

  async create(input: AiSuggestionRecord): Promise<AiSuggestionRecord> {
    this.rows.push({ ...input });
    return { ...input };
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: AiSuggestionStatus,
  ): Promise<AiSuggestionRecord> {
    const row = this.rows.find(
      (candidate) => candidate.tenantId === tenantId && candidate.id === id,
    );
    if (!row) {
      throw new Error(`Suggestion not found: ${id}`);
    }
    row.status = status;
    row.updatedAt = new Date();
    return { ...row };
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<AiSuggestionRecord | null> {
    const row = this.rows.find(
      (candidate) => candidate.tenantId === tenantId && candidate.id === id,
    );
    return row ? { ...row } : null;
  }

  async listByConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<AiSuggestionRecord[]> {
    return this.rows
      .filter(
        (row) =>
          row.tenantId === tenantId && row.conversationId === conversationId,
      )
      .map((row) => ({ ...row }));
  }
}

class InMemoryOwnerEscalationRepository implements IOwnerEscalationRepository {
  readonly rows: OwnerEscalationRecord[] = [];

  async createIfAbsent(
    input: OwnerEscalationRecord,
  ): Promise<{ record: OwnerEscalationRecord; created: boolean }> {
    const existing = this.rows.find(
      (row) =>
        row.tenantId === input.tenantId &&
        row.triggerMessageId === input.triggerMessageId,
    );
    if (existing) {
      return { record: { ...existing }, created: false };
    }
    this.rows.push({ ...input });
    return { record: { ...input }, created: true };
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<OwnerEscalationRecord | null> {
    const row = this.find(tenantId, id);
    return row ? { ...row } : null;
  }

  async listOpenByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<OwnerEscalationRecord[]> {
    return this.rows
      .filter(
        (row) =>
          row.tenantId === tenantId &&
          row.propertyId === propertyId &&
          row.status === "open",
      )
      .map((row) => ({ ...row }));
  }

  async listOpenByTenant(
    tenantId: string,
    allowedPropertyIds: string[] | null,
  ): Promise<OwnerEscalationRecord[]> {
    return this.rows
      .filter(
        (row) =>
          row.tenantId === tenantId &&
          row.status === "open" &&
          (allowedPropertyIds === null ||
            allowedPropertyIds.includes(row.propertyId)),
      )
      .map((row) => ({ ...row }));
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
    const row = this.find(tenantId, id);
    if (!row) {
      throw new Error(`Escalation not found: ${id}`);
    }
    Object.assign(row, patch, { updatedAt: new Date() });
    return { ...row };
  }

  private find(tenantId: string, id: string): OwnerEscalationRecord | undefined {
    return this.rows.find(
      (row) => row.tenantId === tenantId && row.id === id,
    );
  }
}

class InMemoryAiUsageRepository implements IAiUsageRepository {
  readonly rows: AiUsageRecord[] = [];

  async record(input: AiUsageRecord): Promise<AiUsageRecord> {
    this.rows.push({ ...input });
    return { ...input };
  }
}

class ScriptedAssistantProvider implements IAssistantProvider {
  readonly requests: AssistantGenerateRequest[] = [];

  constructor(private readonly script: AssistantGenerateResult[]) {}

  async generate(
    req: AssistantGenerateRequest,
  ): Promise<AssistantGenerateResult> {
    this.requests.push(req);
    const next = this.script.shift();
    if (!next) {
      throw new Error("ScriptedAssistantProvider ran out of scripted results");
    }
    return next;
  }
}

function assistantResult(
  overrides: Partial<AssistantGenerateResult>,
): AssistantGenerateResult {
  return {
    classification: "ANSWERABLE",
    replyText: null,
    requiresEscalation: false,
    escalationReason: null,
    escalationSummary: null,
    unansweredTopics: [],
    knowledgeSourceIds: [],
    safetyFlags: [],
    guestLanguage: "en",
    provider: "test-provider",
    model: "test-model",
    inputTokens: 100,
    outputTokens: 40,
    latencyMs: 12,
    success: true,
    errorCode: null,
    ...overrides,
  };
}

interface Stack {
  conversations: InMemoryConversationRepository;
  messages: InMemoryMessageRepository;
  config: InMemoryAssistantConfigRepository;
  suggestions: InMemoryAiSuggestionRepository;
  escalations: InMemoryOwnerEscalationRepository;
  usage: InMemoryAiUsageRepository;
  ingest: IngestGuestMessageUseCase;
  send: SendOperatorMessageUseCase;
  resolve: ResolveOwnerEscalationUseCase;
  saveToKnowledge: SaveEscalationToKnowledgeUseCase;
  listEscalations: ListOpenEscalationsUseCase;
  createConversation: CreateConversationUseCase;
}

async function makeStack(options: {
  mode: AssistantMode;
  provider: IAssistantProvider;
}): Promise<Stack> {
  const conversations = new InMemoryConversationRepository();
  const messages = new InMemoryMessageRepository();
  const config = new InMemoryAssistantConfigRepository();
  const suggestions = new InMemoryAiSuggestionRepository();
  const escalations = new InMemoryOwnerEscalationRepository();
  const usage = new InMemoryAiUsageRepository();
  const ids = new SequentialIdGenerator();
  const permissionChecker = new PermissionChecker();

  const property = Property.create({
    id: PROPERTY,
    tenantId: TENANT,
    name: "Villa Talos",
    slug: "villa-talos",
    defaultUnit: { id: "unit-1", maxGuests: 4 },
  });
  const properties = {
    findById: async () => property,
  } as unknown as IPropertyRepository;

  const profileSetup = await new UpsertPropertyAssistantProfileUseCase(
    config,
    permissionChecker,
    ids,
  ).execute(
    {
      tenantId: TENANT,
      propertyId: PROPERTY,
      enabled: options.mode !== "off",
      mode: options.mode,
      tone: "friendly",
      replyLength: "short",
    },
    admin,
  );
  expect(profileSetup.isSuccess).toBe(true);

  const knowledgeSetup = await new UpsertPropertyGuestKnowledgeUseCase(
    config,
    permissionChecker,
    ids,
  ).execute(
    {
      tenantId: TENANT,
      propertyId: PROPERTY,
      patch: {
        wifiSsid: "VillaTalos",
        wifiPassword: "talos2026",
        earlyCheckInPolicy: "Early arrival before 15:00 needs owner approval.",
      },
    },
    admin,
  );
  expect(knowledgeSetup.isSuccess).toBe(true);

  return {
    conversations,
    messages,
    config,
    suggestions,
    escalations,
    usage,
    ingest: new IngestGuestMessageUseCase(
      conversations,
      messages,
      config,
      suggestions,
      escalations,
      usage,
      properties,
      options.provider,
      ids,
      permissionChecker,
    ),
    send: new SendOperatorMessageUseCase(
      conversations,
      messages,
      suggestions,
      permissionChecker,
      ids,
    ),
    resolve: new ResolveOwnerEscalationUseCase(
      escalations,
      conversations,
      messages,
      config,
      suggestions,
      usage,
      properties,
      options.provider,
      ids,
      permissionChecker,
    ),
    saveToKnowledge: new SaveEscalationToKnowledgeUseCase(
      escalations,
      config,
      permissionChecker,
      ids,
    ),
    listEscalations: new ListOpenEscalationsUseCase(
      escalations,
      permissionChecker,
    ),
    createConversation: new CreateConversationUseCase(
      conversations,
      permissionChecker,
      ids,
      properties,
    ),
  };
}

async function openConversation(stack: Stack): Promise<ConversationRecord> {
  const created = await stack.createConversation.execute(
    { tenantId: TENANT, propertyId: PROPERTY, guestId: "guest-1" },
    admin,
  );
  expect(created.isSuccess).toBe(true);
  return created.getValue();
}

describe("A — grounded wifi answer auto-sends in autopilot", () => {
  it("replies to the guest and records an auto_sent suggestion", async () => {
    const provider = new ScriptedAssistantProvider([
      assistantResult({
        classification: "ANSWERABLE",
        replyText:
          "The Wi-Fi network is VillaTalos and the password is talos2026.",
        knowledgeSourceIds: [
          "guest_knowledge.wifiSsid",
          "guest_knowledge.wifiPassword",
        ],
      }),
    ]);
    const stack = await makeStack({ mode: "autopilot", provider });
    const conversation = await openConversation(stack);

    const result = await stack.ingest.execute(
      {
        tenantId: TENANT,
        conversationId: conversation.id,
        body: "Hi! What is the wifi password?",
        stay: { guestDisplayName: "Maria", checkIn: "2026-10-01", guestCount: 2 },
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();

    expect(value.autoSent).toBe(true);
    expect(value.sentMessage).not.toBeNull();
    expect(value.sentMessage?.senderType).toBe("assistant");
    expect(value.sentMessage?.body).toContain("talos2026");
    expect(value.sentMessage?.aiSuggestionId).toBe(value.suggestion?.id);
    expect(value.suggestion?.status).toBe("auto_sent");
    expect(value.suggestion?.sourceMessageId).toBe(value.inboundMessage.id);
    expect(value.escalation).toBeNull();
    expect(value.conversation.status).toBe("waiting_guest");

    expect(stack.usage.rows).toHaveLength(1);
    expect(stack.usage.rows[0]?.success).toBe(true);
    expect(stack.usage.rows[0]?.autoAnswered).toBe(true);
  });

  it("hands the provider only allow-listed context", async () => {
    const provider = new ScriptedAssistantProvider([
      assistantResult({
        replyText: "The Wi-Fi password is talos2026.",
        knowledgeSourceIds: ["guest_knowledge.wifiPassword"],
      }),
    ]);
    const stack = await makeStack({ mode: "autopilot", provider });
    const conversation = await openConversation(stack);

    await stack.ingest.execute(
      {
        tenantId: TENANT,
        conversationId: conversation.id,
        body: "wifi password?",
        stay: { guestDisplayName: "Maria", checkIn: "2026-10-01", guestCount: 2 },
      },
      admin,
    );

    const request = provider.requests[0];
    expect(request).toBeDefined();
    expect(Object.keys(request?.context ?? {}).sort()).toEqual([
      "faqs",
      "knowledge",
      "property",
      "recentMessages",
      "stay",
      "style",
    ]);

    const serialized = JSON.stringify(request?.context ?? {});
    expect(serialized).not.toContain("folio");
    expect(serialized).not.toContain("payment");
    expect(serialized).not.toContain("fiscal");
    expect(serialized).not.toContain("guestNote");
    expect(request?.context.knowledge?.wifiPassword).toBe("talos2026");
    expect(request?.context.stay?.guestDisplayName).toBe("Maria");
  });
});

describe("B — early check-in requires an owner decision", () => {
  it("escalates, then polishes and sends the owner answer without touching knowledge", async () => {
    const provider = new ScriptedAssistantProvider([
      assistantResult({
        classification: "REQUIRES_OWNER_DECISION",
        requiresEscalation: true,
        escalationReason: "commercial_decision",
        escalationSummary: "Guest asks for a 10:00 early check-in on 1 Oct.",
        unansweredTopics: ["early_check_in"],
      }),
      assistantResult({
        replyText:
          "Good morning Maria! Early check-in at 12:00 works for us — see you then.",
      }),
    ]);
    const stack = await makeStack({ mode: "autopilot", provider });
    const conversation = await openConversation(stack);
    const knowledgeBefore = await stack.config.getKnowledge();

    const ingested = await stack.ingest.execute(
      {
        tenantId: TENANT,
        conversationId: conversation.id,
        body: "Can we check in at 10:00?",
      },
      admin,
    );

    expect(ingested.isSuccess).toBe(true);
    const ingestValue = ingested.getValue();
    expect(ingestValue.autoSent).toBe(false);
    expect(ingestValue.sentMessage).toBeNull();
    expect(ingestValue.escalation?.classification).toBe(
      "REQUIRES_OWNER_DECISION",
    );
    expect(ingestValue.escalation?.status).toBe("open");
    expect(ingestValue.conversation.status).toBe("waiting_operator");

    // Redelivery of the same inbound message must not fan out escalations.
    const duplicate = await stack.escalations.createIfAbsent({
      ...(ingestValue.escalation as OwnerEscalationRecord),
      id: "other-id",
    });
    expect(duplicate.created).toBe(false);
    expect(stack.escalations.rows).toHaveLength(1);

    const open = await stack.listEscalations.execute(
      { tenantId: TENANT, propertyId: PROPERTY },
      admin,
    );
    expect(open.getValue()).toHaveLength(1);

    const resolved = await stack.resolve.execute(
      {
        tenantId: TENANT,
        escalationId: ingestValue.escalation?.id ?? "",
        ownerReply: "ok 12:00 fine",
      },
      admin,
    );

    expect(resolved.isSuccess).toBe(true);
    const resolveValue = resolved.getValue();
    expect(resolveValue.draftText).toContain("12:00");
    expect(resolveValue.sentMessage).not.toBeNull();
    expect(resolveValue.escalation.status).toBe("answered");
    // The verbatim decision is kept next to the polished reply.
    expect(resolveValue.escalation.ownerRawReply).toBe("ok 12:00 fine");
    // A commercial decision is one-off: nothing is offered for the knowledge base.
    expect(resolveValue.saveToKnowledgeOffered).toBe(false);

    const knowledgeAfter = await stack.config.getKnowledge();
    expect(knowledgeAfter?.earlyCheckInPolicy).toBe(
      knowledgeBefore?.earlyCheckInPolicy,
    );
    expect(await stack.config.listFaqs()).toHaveLength(0);
  });
});

describe("C — UNKNOWN never auto-sends", () => {
  it("keeps the draft pending and escalates to the owner", async () => {
    const provider = new ScriptedAssistantProvider([
      assistantResult({
        classification: "UNKNOWN",
        requiresEscalation: true,
        escalationSummary: "No information about airport transfers.",
        unansweredTopics: ["airport_transfer"],
      }),
    ]);
    const stack = await makeStack({ mode: "autopilot", provider });
    const conversation = await openConversation(stack);

    const result = await stack.ingest.execute(
      {
        tenantId: TENANT,
        conversationId: conversation.id,
        body: "Do you offer an airport transfer?",
      },
      admin,
    );

    const value = result.getValue();
    expect(value.autoSent).toBe(false);
    expect(value.sentMessage).toBeNull();
    expect(value.suggestion?.status).toBe("pending");
    expect(value.escalation?.classification).toBe("UNKNOWN");
    expect(
      stack.messages.rows.filter((row) => row.direction === "outbound"),
    ).toHaveLength(0);
  });

  it("downgrades an ungrounded ANSWERABLE claim instead of sending it", async () => {
    const provider = new ScriptedAssistantProvider([
      assistantResult({
        classification: "ANSWERABLE",
        replyText: "The door code is 4321.",
        knowledgeSourceIds: [],
      }),
    ]);
    const stack = await makeStack({ mode: "autopilot", provider });
    const conversation = await openConversation(stack);

    const value = (
      await stack.ingest.execute(
        {
          tenantId: TENANT,
          conversationId: conversation.id,
          body: "What is the door code?",
        },
        admin,
      )
    ).getValue();

    expect(value.autoSent).toBe(false);
    expect(value.suggestion?.classification).toBe("UNKNOWN");
    expect(value.escalation?.classification).toBe("UNKNOWN");
  });
});

describe("D — knowledge only changes on an explicit confirmation", () => {
  it("offers the save for factual gaps but writes only when confirmed", async () => {
    const provider = new ScriptedAssistantProvider([
      assistantResult({
        classification: "UNKNOWN",
        requiresEscalation: true,
        escalationSummary: "No information about airport transfers.",
        unansweredTopics: ["airport_transfer"],
      }),
      assistantResult({
        replyText: "Yes — we can arrange an airport transfer for 45 €.",
      }),
    ]);
    const stack = await makeStack({ mode: "copilot", provider });
    const conversation = await openConversation(stack);

    const ingestValue = (
      await stack.ingest.execute(
        {
          tenantId: TENANT,
          conversationId: conversation.id,
          body: "Do you offer an airport transfer?",
        },
        admin,
      )
    ).getValue();

    const escalationId = ingestValue.escalation?.id ?? "";
    const knowledgeBefore = await stack.config.getKnowledge();

    const resolved = await stack.resolve.execute(
      { tenantId: TENANT, escalationId, ownerReply: "yes 45 euro transfer" },
      admin,
    );

    const resolveValue = resolved.getValue();
    expect(resolveValue.saveToKnowledgeOffered).toBe(true);
    // Copilot returns a draft; the operator still owns the send.
    expect(resolveValue.sentMessage).toBeNull();
    // Resolving alone never mutates the knowledge base.
    expect((await stack.config.getKnowledge())?.recommendations).toBe(
      knowledgeBefore?.recommendations,
    );

    const notConfirmed = await stack.saveToKnowledge.execute(
      {
        tenantId: TENANT,
        escalationId,
        patch: { transportInfo: "Airport transfer available for 45 € each way." },
        confirm: false,
      },
      admin,
    );

    expect(notConfirmed.isFailure).toBe(true);
    expect(notConfirmed.getError()).toBeInstanceOf(ValidationError);
    expect((await stack.config.getKnowledge())?.transportInfo).toBeNull();

    const confirmed = await stack.saveToKnowledge.execute(
      {
        tenantId: TENANT,
        escalationId,
        patch: { transportInfo: "Airport transfer available for 45 € each way." },
        confirm: true,
      },
      admin,
    );

    expect(confirmed.isSuccess).toBe(true);
    const knowledge = await stack.config.getKnowledge();
    expect(knowledge?.transportInfo).toBe(
      "Airport transfer available for 45 € each way.",
    );
    // Untouched fields survive the partial patch.
    expect(knowledge?.wifiPassword).toBe("talos2026");
  });

  it("rejects a save when the escalation never offered one", async () => {
    const provider = new ScriptedAssistantProvider([
      assistantResult({
        classification: "REQUIRES_OWNER_DECISION",
        requiresEscalation: true,
        escalationSummary: "Guest asks for a discount.",
      }),
      assistantResult({ replyText: "We can offer 5% off." }),
    ]);
    const stack = await makeStack({ mode: "copilot", provider });
    const conversation = await openConversation(stack);

    const ingestValue = (
      await stack.ingest.execute(
        {
          tenantId: TENANT,
          conversationId: conversation.id,
          body: "Any discount for a longer stay?",
        },
        admin,
      )
    ).getValue();

    const escalationId = ingestValue.escalation?.id ?? "";
    await stack.resolve.execute(
      { tenantId: TENANT, escalationId, ownerReply: "5% off is fine" },
      admin,
    );

    const attempted = await stack.saveToKnowledge.execute(
      {
        tenantId: TENANT,
        escalationId,
        patch: { recommendations: "Always give 5% off." },
        confirm: true,
      },
      admin,
    );

    expect(attempted.isFailure).toBe(true);
    expect((await stack.config.getKnowledge())?.recommendations).toBeNull();
  });
});

describe("F — provider failure stays durable", () => {
  it("persists the inbound message, a failed suggestion and a usage row", async () => {
    const stack = await makeStack({
      mode: "autopilot",
      provider: new UnavailableAssistantProvider(),
    });
    const conversation = await openConversation(stack);

    const result = await stack.ingest.execute(
      {
        tenantId: TENANT,
        conversationId: conversation.id,
        body: "What is the wifi password?",
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();

    expect(value.inboundMessage.body).toBe("What is the wifi password?");
    expect(value.autoSent).toBe(false);
    expect(value.sentMessage).toBeNull();
    expect(value.suggestion?.status).toBe("failed");
    expect(value.escalation?.classification).toBe("UNKNOWN");
    expect(value.conversation.status).toBe("waiting_operator");

    const classifyUsage = stack.usage.rows.find(
      (row) => row.operation === "classify_and_draft",
    );
    expect(classifyUsage?.success).toBe(false);
    expect(classifyUsage?.errorCode).toBe("ASSISTANT_PROVIDER_UNAVAILABLE");

    // The operator can still answer by hand.
    const sent = await stack.send.execute(
      {
        tenantId: TENANT,
        conversationId: conversation.id,
        body: "The Wi-Fi password is talos2026.",
        aiSuggestionId: value.suggestion?.id ?? null,
        suggestionStatus: "edited",
      },
      admin,
    );

    expect(sent.isSuccess).toBe(true);
    expect(sent.getValue().senderType).toBe("operator");
    expect(sent.getValue().createdByUserId).toBe(admin.userId);

    const suggestion = await stack.suggestions.findById(
      TENANT,
      value.suggestion?.id ?? "",
    );
    expect(suggestion?.status).toBe("edited");
  });

  it("survives a provider that throws", async () => {
    const throwingProvider: IAssistantProvider = {
      generate: async () => {
        throw new Error("socket hang up");
      },
    };
    const stack = await makeStack({
      mode: "autopilot",
      provider: throwingProvider,
    });
    const conversation = await openConversation(stack);

    const value = (
      await stack.ingest.execute(
        {
          tenantId: TENANT,
          conversationId: conversation.id,
          body: "Is late checkout possible?",
        },
        admin,
      )
    ).getValue();

    expect(value.inboundMessage.id).toBeTruthy();
    expect(value.suggestion?.status).toBe("failed");
    expect(value.escalation).not.toBeNull();
    expect(stack.messages.rows).toHaveLength(1);
  });
});

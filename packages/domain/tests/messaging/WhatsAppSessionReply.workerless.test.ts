import { describe, expect, it } from "vitest";
import { Property } from "../../src/catalog/domain/Property";
import type { IPropertyRepository } from "../../src/catalog/ports/ICatalogRepositories";
import type { IIdGenerator } from "../../src/shared/ports/IIdGenerator";
import {
  PermissionChecker,
  type ActorContext,
} from "../../src/shared/services/PermissionChecker";
import type {
  AiSuggestionRecord,
  AiUsageRecord,
  ConversationRecord,
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
import type {
  IMessagingSecretVault,
  IPlatformMessagingConnectionRepository,
  IWhatsAppCloudApiAdapter,
  WhatsAppOutboundSendRequest,
  WhatsAppOutboundSendResult,
} from "../../src/messaging/ports/IWhatsAppMessagingPorts";
import type { PlatformMessagingConnectionRecord } from "../../src/messaging/domain/WhatsAppMessagingTypes";
import { WhatsAppSessionReplySender } from "../../src/messaging/application/WhatsAppSessionReplySender";
import {
  CreateConversationUseCase,
  IngestGuestMessageUseCase,
  UpsertPropertyAssistantProfileUseCase,
  UpsertPropertyGuestKnowledgeUseCase,
} from "../../src/messaging/application/MessagingUseCases";
import { extendCustomerServiceWindow } from "../../src/messaging/domain/WhatsAppMessagingTypes";

const TENANT = "tenant-wa-session";
const PROPERTY = "prop-wa-session";
const PHONE_NUMBER_ID = "1328257430372445";
const GUEST_WA_ID = "15559998877";
const SECRET_TOKEN = "META_ACCESS_TOKEN_SHOULD_NEVER_APPEAR";

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
  async findById(tenantId: string, id: string): Promise<ConversationRecord | null> {
    const row = this.rows.find((r) => r.tenantId === tenantId && r.id === id);
    return row ? { ...row } : null;
  }
  async listByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<ConversationRecord[]> {
    return this.rows
      .filter((r) => r.tenantId === tenantId && r.propertyId === propertyId)
      .map((r) => ({ ...r }));
  }
  async listByTenant(
    tenantId: string,
    allowedPropertyIds: string[] | null,
  ): Promise<ConversationRecord[]> {
    return this.rows
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          (allowedPropertyIds === null ||
            allowedPropertyIds.includes(r.propertyId)),
      )
      .map((r) => ({ ...r }));
  }
  async updateMeta(
    tenantId: string,
    id: string,
    patch: Partial<ConversationRecord>,
  ): Promise<ConversationRecord> {
    const row = this.rows.find((r) => r.tenantId === tenantId && r.id === id);
    if (!row) throw new Error("missing conversation");
    Object.assign(row, patch);
    return { ...row };
  }
  async findOpenWhatsAppByIdentity(
    tenantId: string,
    guestChannelIdentity: string,
  ): Promise<ConversationRecord[]> {
    return this.rows
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          r.channel === "whatsapp" &&
          r.guestChannelIdentity === guestChannelIdentity &&
          r.status !== "closed",
      )
      .map((r) => ({ ...r }));
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
        (r) => r.tenantId === tenantId && r.conversationId === conversationId,
      )
      .map((r) => ({ ...r }));
  }
  async findById(tenantId: string, id: string): Promise<MessageRecord | null> {
    const row = this.rows.find((r) => r.tenantId === tenantId && r.id === id);
    return row ? { ...row } : null;
  }
  async findByExternalMessageId(
    tenantId: string,
    externalMessageId: string,
  ): Promise<MessageRecord | null> {
    const row = this.rows.find(
      (r) =>
        r.tenantId === tenantId && r.externalMessageId === externalMessageId,
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
    const row = this.rows.find((r) => r.tenantId === tenantId && r.id === id);
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
    this.profile = { ...input };
    return { ...input };
  }
  async getKnowledge(): Promise<PropertyGuestKnowledgeRecord | null> {
    return this.knowledge ? { ...this.knowledge } : null;
  }
  async upsertKnowledge(
    input: PropertyGuestKnowledgeRecord,
  ): Promise<PropertyGuestKnowledgeRecord> {
    this.knowledge = { ...input };
    return { ...input };
  }
  async listFaqs(): Promise<PropertyFaqItemRecord[]> {
    return this.faqs.map((f) => ({ ...f }));
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
    this.faqs = params.items.map((f) => ({
      id: f.id,
      tenantId: params.tenantId,
      propertyId: params.propertyId,
      question: f.question,
      answer: f.answer,
      sortOrder: f.sortOrder,
      isActive: f.isActive,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    return this.listFaqs();
  }
}

class InMemoryAiSuggestionRepository implements IAiSuggestionRepository {
  readonly rows: AiSuggestionRecord[] = [];
  async create(input: AiSuggestionRecord): Promise<AiSuggestionRecord> {
    this.rows.push({ ...input });
    return { ...input };
  }
  async findById(
    tenantId: string,
    id: string,
  ): Promise<AiSuggestionRecord | null> {
    const row = this.rows.find((r) => r.tenantId === tenantId && r.id === id);
    return row ? { ...row } : null;
  }
  async listByConversation(
    tenantId: string,
    conversationId: string,
  ): Promise<AiSuggestionRecord[]> {
    return this.rows
      .filter(
        (r) => r.tenantId === tenantId && r.conversationId === conversationId,
      )
      .map((r) => ({ ...r }));
  }
  async updateStatus(
    tenantId: string,
    id: string,
    status: AiSuggestionRecord["status"],
  ): Promise<AiSuggestionRecord> {
    const row = this.rows.find((r) => r.tenantId === tenantId && r.id === id);
    if (!row) throw new Error("missing suggestion");
    row.status = status;
    return { ...row };
  }
}

class InMemoryOwnerEscalationRepository implements IOwnerEscalationRepository {
  readonly rows: OwnerEscalationRecord[] = [];
  async createIfAbsent(
    input: OwnerEscalationRecord,
  ): Promise<{ record: OwnerEscalationRecord; created: boolean }> {
    const existing = this.rows.find(
      (r) =>
        r.tenantId === input.tenantId &&
        r.conversationId === input.conversationId &&
        r.status === "open",
    );
    if (existing) return { record: { ...existing }, created: false };
    this.rows.push({ ...input });
    return { record: { ...input }, created: true };
  }
  async findById(
    tenantId: string,
    id: string,
  ): Promise<OwnerEscalationRecord | null> {
    const row = this.rows.find((r) => r.tenantId === tenantId && r.id === id);
    return row ? { ...row } : null;
  }
  async listOpenByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<OwnerEscalationRecord[]> {
    return this.rows
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          r.propertyId === propertyId &&
          r.status === "open",
      )
      .map((r) => ({ ...r }));
  }
  async listOpenByTenant(
    tenantId: string,
    allowedPropertyIds: string[] | null,
  ): Promise<OwnerEscalationRecord[]> {
    return this.rows
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          r.status === "open" &&
          (allowedPropertyIds === null ||
            allowedPropertyIds.includes(r.propertyId)),
      )
      .map((r) => ({ ...r }));
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
    const row = this.rows.find((r) => r.tenantId === tenantId && r.id === id);
    if (!row) throw new Error("missing escalation");
    Object.assign(row, patch);
    return { ...row };
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
  constructor(private readonly results: AssistantGenerateResult[]) {}
  async generate(
    _request: AssistantGenerateRequest,
  ): Promise<AssistantGenerateResult> {
    void _request;
    const next = this.results.shift();
    if (!next) throw new Error("no scripted assistant result");
    return next;
  }
}

class FakeCloudApi implements IWhatsAppCloudApiAdapter {
  readonly sent: WhatsAppOutboundSendRequest[] = [];
  failNext = false;
  nextWamid = "wamid.outbound.test";
  lastAccessTokenSeen: string | null = null;

  verifyWebhookSignature(): boolean {
    return true;
  }

  async send(
    request: WhatsAppOutboundSendRequest,
  ): Promise<WhatsAppOutboundSendResult> {
    this.lastAccessTokenSeen = request.accessToken;
    this.sent.push({ ...request, accessToken: "[redacted]" });
    if (this.failNext) {
      this.failNext = false;
      return {
        success: false,
        externalMessageId: null,
        errorCode: "meta_api_fail",
        httpStatus: 500,
      };
    }
    return {
      success: true,
      externalMessageId: this.nextWamid,
      errorCode: null,
      httpStatus: 200,
    };
  }
}

class InMemoryPlatformConnections
  implements IPlatformMessagingConnectionRepository
{
  row: PlatformMessagingConnectionRecord | null = null;

  async findConnectedWhatsApp(): Promise<PlatformMessagingConnectionRecord | null> {
    return this.row?.status === "connected" ? { ...this.row } : null;
  }
  async findByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<PlatformMessagingConnectionRecord | null> {
    if (!this.row || this.row.phoneNumberId !== phoneNumberId) return null;
    return { ...this.row };
  }
  async upsertConnected(
    input: PlatformMessagingConnectionRecord,
  ): Promise<PlatformMessagingConnectionRecord> {
    this.row = { ...input };
    return { ...input };
  }
}

class InMemoryVault implements IMessagingSecretVault {
  private store = new Map<string, Record<string, string>>();
  putCalls = 0;

  async putPlatformCredential(
    material: Record<string, string>,
  ): Promise<string> {
    this.putCalls += 1;
    const ref = `platform/cred-${this.putCalls}`;
    this.store.set(ref, { ...material });
    return ref;
  }
  async putPlatformWebhookVerification(secret: string): Promise<string> {
    const ref = `platform/wh-${this.store.size + 1}`;
    this.store.set(ref, { secret });
    return ref;
  }
  async resolvePlatformCredential(
    ref: string,
  ): Promise<Record<string, string>> {
    const m = this.store.get(ref);
    if (!m) throw new Error("missing credential");
    return { ...m };
  }
  async resolvePlatformWebhookVerification(ref: string): Promise<string> {
    return this.store.get(ref)?.secret ?? "";
  }
}

function connectedPlatform(
  overrides: Partial<PlatformMessagingConnectionRecord> = {},
): PlatformMessagingConnectionRecord {
  const now = new Date();
  return {
    id: "plat-1",
    channel: "whatsapp",
    provider: "meta_cloud",
    externalAccountId: "28567329549617803",
    phoneNumberId: PHONE_NUMBER_ID,
    displayPhoneNumber: "+15551589328",
    credentialRef: "platform/cred-1",
    webhookVerificationRef: null,
    status: "connected",
    configJson: {},
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function baseConversation(
  overrides: Partial<ConversationRecord> = {},
): ConversationRecord {
  const now = new Date();
  return {
    id: "conv-1",
    tenantId: TENANT,
    propertyId: PROPERTY,
    guestId: "guest-1",
    bookingId: "booking-1",
    channel: "whatsapp",
    externalThreadId: null,
    status: "open",
    subject: null,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
    guestChannelIdentity: GUEST_WA_ID,
    lastGuestInboundAt: now,
    cswOpenUntil: extendCustomerServiceWindow(now),
    routingStatus: "ok",
    ...overrides,
  };
}

function pendingAssistantMessage(
  overrides: Partial<MessageRecord> = {},
): MessageRecord {
  return {
    id: "msg-out-1",
    tenantId: TENANT,
    propertyId: PROPERTY,
    conversationId: "conv-1",
    direction: "outbound",
    senderType: "assistant",
    body: "The Wi-Fi password is talos2026.",
    deliveryStatus: "pending",
    externalMessageId: null,
    createdByUserId: null,
    aiSuggestionId: "sug-1",
    createdAt: new Date(),
    ...overrides,
  };
}

describe("WhatsAppSessionReplySender (workerless Meta session send)", () => {
  it("sends via the inbound PlatformMessagingConnection phoneNumberId and guest wa_id", async () => {
    const connections = new InMemoryPlatformConnections();
    connections.row = connectedPlatform();
    const vault = new InMemoryVault();
    await vault.putPlatformCredential({ accessToken: SECRET_TOKEN });
    connections.row.credentialRef = "platform/cred-1";
    const api = new FakeCloudApi();
    const messages = new InMemoryMessageRepository();
    const message = pendingAssistantMessage();
    await messages.append(message);

    const sender = new WhatsAppSessionReplySender(
      connections,
      vault,
      api,
      messages,
    );
    const result = await sender.deliver({
      tenantId: TENANT,
      conversation: baseConversation(),
      message,
      phoneNumberId: PHONE_NUMBER_ID,
      clientMessageId: "talos-out-inbound-1",
    });

    expect(result.success).toBe(true);
    expect(result.message.deliveryStatus).toBe("sent");
    expect(result.message.externalMessageId).toBe("wamid.outbound.test");
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]!.phoneNumberId).toBe(PHONE_NUMBER_ID);
    expect(api.sent[0]!.toE164).toBe(`+${GUEST_WA_ID}`);
    expect(api.sent[0]!.kind).toBe("text");
    expect(api.sent[0]!.clientMessageId).toBe("talos-out-inbound-1");
    expect(api.lastAccessTokenSeen).toBe(SECRET_TOKEN);
    // Serialized send log must not retain the raw token.
    expect(JSON.stringify(api.sent)).not.toContain(SECRET_TOKEN);
  });

  it("is idempotent when Message already sent (no duplicate Meta call)", async () => {
    const connections = new InMemoryPlatformConnections();
    connections.row = connectedPlatform({ credentialRef: "platform/cred-1" });
    const vault = new InMemoryVault();
    await vault.putPlatformCredential({ accessToken: SECRET_TOKEN });
    const api = new FakeCloudApi();
    const messages = new InMemoryMessageRepository();
    const message = pendingAssistantMessage({
      deliveryStatus: "sent",
      externalMessageId: "wamid.already",
    });
    await messages.append(message);

    const sender = new WhatsAppSessionReplySender(
      connections,
      vault,
      api,
      messages,
    );
    const first = await sender.deliver({
      tenantId: TENANT,
      conversation: baseConversation(),
      message,
      phoneNumberId: PHONE_NUMBER_ID,
      clientMessageId: "talos-out-1",
    });
    const second = await sender.deliver({
      tenantId: TENANT,
      conversation: baseConversation(),
      message: first.message,
      phoneNumberId: PHONE_NUMBER_ID,
      clientMessageId: "talos-out-1",
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(api.sent).toHaveLength(0);
  });

  it("fails closed on ambiguous routing without calling Meta", async () => {
    const connections = new InMemoryPlatformConnections();
    connections.row = connectedPlatform({ credentialRef: "platform/cred-1" });
    const vault = new InMemoryVault();
    await vault.putPlatformCredential({ accessToken: SECRET_TOKEN });
    const api = new FakeCloudApi();
    const messages = new InMemoryMessageRepository();
    const message = pendingAssistantMessage();
    await messages.append(message);

    const sender = new WhatsAppSessionReplySender(
      connections,
      vault,
      api,
      messages,
    );
    const result = await sender.deliver({
      tenantId: TENANT,
      conversation: baseConversation({ routingStatus: "ambiguous" }),
      message,
      phoneNumberId: PHONE_NUMBER_ID,
      clientMessageId: "talos-out-amb",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("routing_ambiguous");
    expect(result.message.deliveryStatus).toBe("failed");
    expect(api.sent).toHaveLength(0);
  });

  it("fails closed when guest wa_id is missing", async () => {
    const connections = new InMemoryPlatformConnections();
    connections.row = connectedPlatform({ credentialRef: "platform/cred-1" });
    const vault = new InMemoryVault();
    await vault.putPlatformCredential({ accessToken: SECRET_TOKEN });
    const api = new FakeCloudApi();
    const messages = new InMemoryMessageRepository();
    const message = pendingAssistantMessage();
    await messages.append(message);

    const sender = new WhatsAppSessionReplySender(
      connections,
      vault,
      api,
      messages,
    );
    const result = await sender.deliver({
      tenantId: TENANT,
      conversation: baseConversation({ guestChannelIdentity: null }),
      message,
      phoneNumberId: PHONE_NUMBER_ID,
      clientMessageId: "talos-out-noid",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("missing_wa_identity");
    expect(api.sent).toHaveLength(0);
  });

  it("preserves assistant Message and records failed when Meta API errors", async () => {
    const connections = new InMemoryPlatformConnections();
    connections.row = connectedPlatform({ credentialRef: "platform/cred-1" });
    const vault = new InMemoryVault();
    await vault.putPlatformCredential({ accessToken: SECRET_TOKEN });
    const api = new FakeCloudApi();
    api.failNext = true;
    const messages = new InMemoryMessageRepository();
    const message = pendingAssistantMessage();
    await messages.append(message);

    const sender = new WhatsAppSessionReplySender(
      connections,
      vault,
      api,
      messages,
    );
    const result = await sender.deliver({
      tenantId: TENANT,
      conversation: baseConversation(),
      message,
      phoneNumberId: PHONE_NUMBER_ID,
      clientMessageId: "talos-out-fail",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("meta_api_fail");
    expect(result.message.id).toBe(message.id);
    expect(result.message.body).toBe(message.body);
    expect(result.message.deliveryStatus).toBe("failed");
    const stored = await messages.findById(TENANT, message.id);
    expect(stored?.deliveryStatus).toBe("failed");
    expect(JSON.stringify(result)).not.toContain(SECRET_TOKEN);
  });

  it("fails closed when phoneNumberId does not match a connected platform row", async () => {
    const connections = new InMemoryPlatformConnections();
    connections.row = connectedPlatform({ credentialRef: "platform/cred-1" });
    const vault = new InMemoryVault();
    await vault.putPlatformCredential({ accessToken: SECRET_TOKEN });
    const api = new FakeCloudApi();
    const messages = new InMemoryMessageRepository();
    const message = pendingAssistantMessage();
    await messages.append(message);

    const sender = new WhatsAppSessionReplySender(
      connections,
      vault,
      api,
      messages,
    );
    const result = await sender.deliver({
      tenantId: TENANT,
      conversation: baseConversation(),
      message,
      phoneNumberId: "9999999999999999",
      clientMessageId: "talos-out-mismatch",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("platform_connection_missing");
    expect(api.sent).toHaveLength(0);
  });
});

describe("IngestGuestMessageUseCase + workerless WhatsApp session reply", () => {
  async function makeIngest(api: FakeCloudApi) {
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
      name: "Villa Session",
      slug: "villa-session",
      defaultUnit: { id: "unit-1", maxGuests: 4 },
    });
    const properties = {
      findById: async () => property,
    } as unknown as IPropertyRepository;

    await new UpsertPropertyAssistantProfileUseCase(
      config,
      permissionChecker,
      ids,
    ).execute(
      {
        tenantId: TENANT,
        propertyId: PROPERTY,
        enabled: true,
        mode: "autopilot",
        tone: "friendly",
        replyLength: "short",
      },
      admin,
    );
    await new UpsertPropertyGuestKnowledgeUseCase(
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
        },
      },
      admin,
    );

    const connections = new InMemoryPlatformConnections();
    const vault = new InMemoryVault();
    const credRef = await vault.putPlatformCredential({
      accessToken: SECRET_TOKEN,
    });
    connections.row = connectedPlatform({ credentialRef: credRef });

    const sessionSender = new WhatsAppSessionReplySender(
      connections,
      vault,
      api,
      messages,
    );

    const createConversation = new CreateConversationUseCase(
      conversations,
      permissionChecker,
      ids,
      properties,
    );
    const created = await createConversation.execute(
      {
        tenantId: TENANT,
        propertyId: PROPERTY,
        guestId: "guest-1",
        bookingId: "booking-1",
        channel: "whatsapp",
      },
      admin,
    );
    expect(created.isSuccess).toBe(true);
    let conversation = created.getValue();
    conversation = await conversations.updateMeta(TENANT, conversation.id, {
      guestChannelIdentity: GUEST_WA_ID,
      bookingId: "booking-1",
      lastGuestInboundAt: new Date(),
      cswOpenUntil: extendCustomerServiceWindow(),
      routingStatus: "ok",
    });

    const provider = new ScriptedAssistantProvider([
      {
        success: true,
        provider: "scripted",
        model: "test",
        classification: "ANSWERABLE",
        replyText:
          "The Wi-Fi network is VillaTalos and the password is talos2026.",
        requiresEscalation: false,
        escalationReason: null,
        escalationSummary: null,
        unansweredTopics: [],
        knowledgeSourceIds: [
          "guest_knowledge.wifiSsid",
          "guest_knowledge.wifiPassword",
        ],
        safetyFlags: [],
        guestLanguage: "en",
        inputTokens: 10,
        outputTokens: 20,
        latencyMs: 5,
        errorCode: null,
      },
    ]);

    const ingest = new IngestGuestMessageUseCase(
      conversations,
      messages,
      config,
      suggestions,
      escalations,
      usage,
      properties,
      provider,
      ids,
      permissionChecker,
      undefined,
      sessionSender,
    );

    return { ingest, conversations, messages, conversation, api };
  }

  it("delivers assistant reply on WhatsApp with phoneNumberId + wa_id", async () => {
    const api = new FakeCloudApi();
    const { ingest, conversation, messages } = await makeIngest(api);

    const result = await ingest.execute(
      {
        tenantId: TENANT,
        conversationId: conversation.id,
        body: "What is the Wi-Fi password?",
        externalMessageId: "wamid.inbound.1",
        whatsappPhoneNumberId: PHONE_NUMBER_ID,
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.autoSent).toBe(true);
    expect(value.sentMessage?.deliveryStatus).toBe("sent");
    expect(value.sentMessage?.externalMessageId).toBe("wamid.outbound.test");
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]!.phoneNumberId).toBe(PHONE_NUMBER_ID);
    expect(api.sent[0]!.toE164).toBe(`+${GUEST_WA_ID}`);

    const outbound = messages.rows.filter((m) => m.direction === "outbound");
    expect(outbound).toHaveLength(1);
    expect(outbound[0]!.body.length).toBeGreaterThan(0);
  });

  it("dedupes duplicate inbound wamid — no second Meta send", async () => {
    const api = new FakeCloudApi();
    const { ingest, conversation } = await makeIngest(api);

    const first = await ingest.execute(
      {
        tenantId: TENANT,
        conversationId: conversation.id,
        body: "What is the Wi-Fi password?",
        externalMessageId: "wamid.inbound.dup",
        whatsappPhoneNumberId: PHONE_NUMBER_ID,
      },
      admin,
    );
    expect(first.isSuccess).toBe(true);
    expect(first.getValue().autoSent).toBe(true);
    expect(api.sent).toHaveLength(1);

    const second = await ingest.execute(
      {
        tenantId: TENANT,
        conversationId: conversation.id,
        body: "What is the Wi-Fi password?",
        externalMessageId: "wamid.inbound.dup",
        whatsappPhoneNumberId: PHONE_NUMBER_ID,
      },
      admin,
    );
    expect(second.isSuccess).toBe(true);
    expect(second.getValue().autoSent).toBe(false);
    expect(second.getValue().sentMessage).toBeNull();
    expect(api.sent).toHaveLength(1);
  });

  it("does not auto-reply AI when conversation routing is ambiguous", async () => {
    const api = new FakeCloudApi();
    const { ingest, conversations, conversation } = await makeIngest(api);
    await conversations.updateMeta(TENANT, conversation.id, {
      routingStatus: "ambiguous",
    });

    const result = await ingest.execute(
      {
        tenantId: TENANT,
        conversationId: conversation.id,
        body: "What is the Wi-Fi password?",
        externalMessageId: "wamid.inbound.amb",
        whatsappPhoneNumberId: PHONE_NUMBER_ID,
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().autoSent).toBe(false);
    expect(result.getValue().sentMessage).toBeNull();
    expect(api.sent).toHaveLength(0);
  });

  it("keeps assistant Message when Meta fails mid-session-send", async () => {
    const api = new FakeCloudApi();
    api.failNext = true;
    const { ingest, conversation, messages } = await makeIngest(api);

    const result = await ingest.execute(
      {
        tenantId: TENANT,
        conversationId: conversation.id,
        body: "What is the Wi-Fi password?",
        externalMessageId: "wamid.inbound.fail",
        whatsappPhoneNumberId: PHONE_NUMBER_ID,
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.autoSent).toBe(true);
    expect(value.sentMessage?.deliveryStatus).toBe("failed");
    expect(value.sentMessage?.body).toContain("Wi-Fi");
    expect(messages.rows.filter((m) => m.direction === "outbound")).toHaveLength(
      1,
    );
    expect(JSON.stringify(value)).not.toContain(SECRET_TOKEN);
  });

  it("marks failed when whatsappPhoneNumberId is missing (fail closed)", async () => {
    const api = new FakeCloudApi();
    const { ingest, conversation } = await makeIngest(api);

    const result = await ingest.execute(
      {
        tenantId: TENANT,
        conversationId: conversation.id,
        body: "What is the Wi-Fi password?",
        externalMessageId: "wamid.inbound.nophone",
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().sentMessage?.deliveryStatus).toBe("failed");
    expect(api.sent).toHaveLength(0);
  });
});

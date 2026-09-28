import { describe, expect, it, vi, afterEach } from "vitest";
import {
  HeuristicAssistantProvider,
  UnavailableAssistantProvider,
  createAssistantProviderFailureResult,
  isAssistantProviderFailureReason,
  shouldAutoSend,
  buildAssistantContext,
  amenitySourceId,
  IngestGuestMessageUseCase,
  CreateConversationUseCase,
  UpsertPropertyAssistantProfileUseCase,
  type PropertyAssistantProfileRecord,
  type PropertyGuestKnowledgeRecord,
  type IAssistantProvider,
  type AssistantGenerateRequest,
  type AssistantGenerateResult,
} from "../../src/messaging";
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
  PropertyFaqItemRecord,
} from "../../src/messaging/domain/MessagingTypes";
import type {
  IAiSuggestionRepository,
  IAiUsageRepository,
  IConversationRepository,
  IMessageRepository,
  IOwnerEscalationRepository,
  IPropertyAssistantConfigRepository,
} from "../../src/messaging/ports/IMessagingRepositories";

const now = new Date();
const TENANT = "11111111-1111-1111-1111-111111111111";
const PROPERTY = "22222222-2222-2222-2222-222222222222";
const admin: ActorContext = {
  userId: "user-admin",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: false,
};

const profile: PropertyAssistantProfileRecord = {
  id: "p1",
  tenantId: TENANT,
  propertyId: PROPERTY,
  enabled: true,
  mode: "autopilot",
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

function emptyKnowledge(): PropertyGuestKnowledgeRecord {
  return {
    id: "k1",
    tenantId: TENANT,
    propertyId: PROPERTY,
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

function buildCtx(options?: {
  amenities?: Array<{ id: string; name: string }>;
  knowledge?: PropertyGuestKnowledgeRecord | null;
}) {
  return buildAssistantContext({
    property: {
      id: PROPERTY,
      name: "Demo Villa",
      type: "villa",
      description: null,
      checkInTime: "15:00",
      checkOutTime: "11:00",
      addressLine: null,
      city: "Athens",
      region: null,
      postalCode: null,
      country: "GR",
    },
    profile,
    knowledge: options?.knowledge ?? null,
    faqs: [],
    amenities: options?.amenities ?? [],
    stay: null,
    messages: [],
  });
}

describe("provider failure distinction", () => {
  it("marks infrastructure failures distinctly from knowledge UNKNOWN", () => {
    const fail = createAssistantProviderFailureResult({
      errorCode: "gemini_timeout",
      provider: "gemini",
    });
    expect(fail.success).toBe(false);
    expect(fail.replyText).toBeNull();
    expect(isAssistantProviderFailureReason(fail.escalationReason)).toBe(true);
    expect(
      shouldAutoSend(
        "autopilot",
        fail.classification,
        fail.knowledgeSourceIds,
        fail.safetyFlags,
      ),
    ).toBe(false);
  });

  it("UnavailableAssistantProvider never fabricates a guest draft", async () => {
    const result = await new UnavailableAssistantProvider().generate({
      context: buildCtx(),
      inboundMessage: "What is the wifi password?",
      operation: "classify_and_draft",
    });
    expect(result.success).toBe(false);
    expect(result.replyText).toBeNull();
    expect(isAssistantProviderFailureReason(result.escalationReason)).toBe(true);
  });
});

describe("amenity grounding (heuristic demo provider)", () => {
  const provider = new HeuristicAssistantProvider();

  it("pool amenity answers availability with amenity:{id} source", async () => {
    const poolId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const result = await provider.generate({
      context: buildCtx({
        amenities: [{ id: poolId, name: "Pool" }],
      }),
      inboundMessage: "Do you have a pool?",
      operation: "classify_and_draft",
    });
    expect(result.classification).toBe("ANSWERABLE");
    expect(result.replyText).toMatch(/Pool/i);
    expect(result.knowledgeSourceIds).toContain(amenitySourceId(poolId));
    expect(
      shouldAutoSend(
        "autopilot",
        result.classification,
        result.knowledgeSourceIds,
        result.safetyFlags,
      ),
    ).toBe(true);
  });

  it("Wi-Fi amenity + password knowledge grounds both sources", async () => {
    const wifiId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const knowledge = {
      ...emptyKnowledge(),
      wifiSsid: "TalosGuest",
      wifiPassword: "secret-pass",
    };
    const result = await provider.generate({
      context: buildCtx({
        amenities: [{ id: wifiId, name: "Wi-Fi" }],
        knowledge,
      }),
      inboundMessage: "What is the wifi password?",
      operation: "classify_and_draft",
    });
    expect(result.classification).toBe("ANSWERABLE");
    expect(result.replyText).toMatch(/secret-pass/);
    expect(result.knowledgeSourceIds).toContain(amenitySourceId(wifiId));
    expect(result.knowledgeSourceIds).toContain("guest_knowledge.wifi_password");
  });

  it("Wi-Fi amenity without password does not invent a password", async () => {
    const wifiId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const result = await provider.generate({
      context: buildCtx({
        amenities: [{ id: wifiId, name: "Wi-Fi" }],
        knowledge: emptyKnowledge(),
      }),
      inboundMessage: "What is the wifi password?",
      operation: "classify_and_draft",
    });
    expect(result.classification).toBe("UNKNOWN");
    expect(result.replyText).toBeNull();
    expect(result.requiresEscalation).toBe(true);
  });

  it("Wi-Fi amenity alone can confirm availability", async () => {
    const wifiId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const result = await provider.generate({
      context: buildCtx({
        amenities: [{ id: wifiId, name: "Wi-Fi" }],
      }),
      inboundMessage: "Do you have Wi-Fi?",
      operation: "classify_and_draft",
    });
    expect(result.classification).toBe("ANSWERABLE");
    expect(result.knowledgeSourceIds).toEqual([amenitySourceId(wifiId)]);
  });
});

class SeqIds implements IIdGenerator {
  private n = 0;
  generate() {
    this.n += 1;
    return `00000000-0000-4000-8000-${String(this.n).padStart(12, "0")}`;
  }
}

class MemConversations implements IConversationRepository {
  rows: ConversationRecord[] = [];
  async create(input: ConversationRecord) {
    this.rows.push(input);
    return input;
  }
  async findById(tenantId: string, id: string) {
    return this.rows.find((r) => r.tenantId === tenantId && r.id === id) ?? null;
  }
  async listByProperty() {
    return this.rows;
  }
  async listByTenant() {
    return this.rows;
  }
  async updateMeta(tenantId: string, id: string, patch: Partial<ConversationRecord>) {
    const row = this.rows.find((r) => r.tenantId === tenantId && r.id === id)!;
    Object.assign(row, patch);
    return row;
  }
}

class MemMessages implements IMessageRepository {
  rows: MessageRecord[] = [];
  async append(input: MessageRecord) {
    this.rows.push(input);
    return input;
  }
  async listByConversation(tenantId: string, conversationId: string) {
    return this.rows.filter(
      (r) => r.tenantId === tenantId && r.conversationId === conversationId,
    );
  }
  async findById(tenantId: string, id: string) {
    return this.rows.find((r) => r.tenantId === tenantId && r.id === id) ?? null;
  }
}

class MemConfig implements IPropertyAssistantConfigRepository {
  profile: PropertyAssistantProfileRecord | null = null;
  knowledge: PropertyGuestKnowledgeRecord | null = null;
  faqs: PropertyFaqItemRecord[] = [];
  async getProfile() {
    return this.profile;
  }
  async upsertProfile(input: PropertyAssistantProfileRecord) {
    this.profile = input;
    return input;
  }
  async getKnowledge() {
    return this.knowledge;
  }
  async upsertKnowledge(input: PropertyGuestKnowledgeRecord) {
    this.knowledge = input;
    return input;
  }
  async listFaqs() {
    return this.faqs;
  }
  async replaceFaqs() {
    return this.faqs;
  }
}

class MemSuggestions implements IAiSuggestionRepository {
  rows: AiSuggestionRecord[] = [];
  async create(input: AiSuggestionRecord) {
    this.rows.push(input);
    return input;
  }
  async updateStatus() {
    return this.rows[0]!;
  }
  async findById() {
    return null;
  }
  async listByConversation() {
    return this.rows;
  }
}

class MemEscalations implements IOwnerEscalationRepository {
  rows: OwnerEscalationRecord[] = [];
  async createIfAbsent(input: OwnerEscalationRecord) {
    this.rows.push(input);
    return { record: input, created: true };
  }
  async findById(tenantId: string, id: string) {
    return this.rows.find((r) => r.tenantId === tenantId && r.id === id) ?? null;
  }
  async listOpenByProperty() {
    return this.rows.filter((r) => r.status === "open");
  }
  async listOpenByTenant() {
    return this.rows.filter((r) => r.status === "open");
  }
  async resolve() {
    return this.rows[0]!;
  }
}

class MemUsage implements IAiUsageRepository {
  rows: AiUsageRecord[] = [];
  async record(input: AiUsageRecord) {
    this.rows.push(input);
    return input;
  }
}

class MemProperties implements IPropertyRepository {
  constructor(private readonly property: Property) {}
  async save() {}
  async findById(tenantId: string, id: string) {
    if (tenantId !== TENANT || id !== PROPERTY) return null;
    return this.property;
  }
  async findBySlug() {
    return null;
  }
  async existsBySlug() {
    return false;
  }
  async findAll() {
    return { data: [this.property], total: 1, page: 1, limit: 50 };
  }
  async listUnitCatalog() {
    return { properties: [] };
  }
}

class FailingGemini implements IAssistantProvider {
  constructor(private readonly errorCode: string) {}
  async generate(req: AssistantGenerateRequest): Promise<AssistantGenerateResult> {
    return createAssistantProviderFailureResult({
      errorCode: this.errorCode,
      provider: "gemini",
      model: "gemini-2.0-flash",
      operation: req.operation,
      ownerRawReply: req.ownerRawReply,
    });
  }
}

describe("Gemini-mode fail-closed ingest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function setup(assistant: IAssistantProvider) {
    const ids = new SeqIds();
    const conversations = new MemConversations();
    const messages = new MemMessages();
    const config = new MemConfig();
    const suggestions = new MemSuggestions();
    const escalations = new MemEscalations();
    const usage = new MemUsage();
    const property = Property.create({
      id: PROPERTY,
      tenantId: TENANT,
      name: "Demo Villa",
      slug: "demo-villa",
      type: "villa",
      timezone: "Europe/Athens",
      defaultUnit: { id: "33333333-3333-3333-3333-333333333333" },
    });
    const permissionChecker = new PermissionChecker();
    const upsertProfile = new UpsertPropertyAssistantProfileUseCase(
      config,
      permissionChecker,
      ids,
    );
    await upsertProfile.execute(
      {
        tenantId: TENANT,
        propertyId: PROPERTY,
        enabled: true,
        mode: "autopilot",
      },
      admin,
    );
    const createConversation = new CreateConversationUseCase(
      conversations,
      permissionChecker,
      ids,
      new MemProperties(property),
    );
    const ingest = new IngestGuestMessageUseCase(
      conversations,
      messages,
      config,
      suggestions,
      escalations,
      usage,
      new MemProperties(property),
      assistant,
      ids,
      permissionChecker,
    );
    const conv = (
      await createConversation.execute(
        { tenantId: TENANT, propertyId: PROPERTY },
        admin,
      )
    ).getValue();
    return { ingest, messages, suggestions, escalations, usage, conv };
  }

  it("missing Gemini key path: no heuristic reply, no autopilot send, durable inbound", async () => {
    const s = await setup(new FailingGemini("gemini_api_key_missing"));
    const result = (
      await s.ingest.execute(
        {
          tenantId: TENANT,
          conversationId: s.conv.id,
          body: "What is the wifi password?",
          amenities: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Wi-Fi" }],
        },
        admin,
      )
    ).getValue();

    expect(result.inboundMessage.body).toMatch(/wifi/i);
    expect(result.autoSent).toBe(false);
    expect(result.sentMessage).toBeNull();
    expect(result.suggestion?.status).toBe("failed");
    expect(result.suggestion?.suggestedBody).toBeNull();
    expect(result.escalation).not.toBeNull();
    expect(
      isAssistantProviderFailureReason(result.escalation?.reason),
    ).toBe(true);
    expect(s.usage.rows.some((u) => !u.success && u.errorCode === "gemini_api_key_missing")).toBe(
      true,
    );
  });

  it("Gemini timeout: same fail-closed behavior", async () => {
    const s = await setup(new FailingGemini("gemini_timeout"));
    const result = (
      await s.ingest.execute(
        {
          tenantId: TENANT,
          conversationId: s.conv.id,
          body: "Do you have a pool?",
        },
        admin,
      )
    ).getValue();
    expect(result.autoSent).toBe(false);
    expect(result.suggestion?.suggestedBody).toBeNull();
    expect(isAssistantProviderFailureReason(result.escalation?.reason)).toBe(
      true,
    );
  });

  it("invalid structured output: fail-closed", async () => {
    const s = await setup(new FailingGemini("gemini_invalid_structured_output"));
    const result = (
      await s.ingest.execute(
        {
          tenantId: TENANT,
          conversationId: s.conv.id,
          body: "Hello",
        },
        admin,
      )
    ).getValue();
    expect(result.autoSent).toBe(false);
    expect(result.suggestion?.status).toBe("failed");
  });

  it("Copilot Gemini failure: no fake suggestion body", async () => {
    const ids = new SeqIds();
    const conversations = new MemConversations();
    const messages = new MemMessages();
    const config = new MemConfig();
    const suggestions = new MemSuggestions();
    const escalations = new MemEscalations();
    const usage = new MemUsage();
    const property = Property.create({
      id: PROPERTY,
      tenantId: TENANT,
      name: "Demo Villa",
      slug: "demo-villa-2",
      type: "villa",
      timezone: "Europe/Athens",
      defaultUnit: { id: "44444444-4444-4444-8444-444444444444" },
    });
    const permissionChecker = new PermissionChecker();
    await new UpsertPropertyAssistantProfileUseCase(
      config,
      permissionChecker,
      ids,
    ).execute(
      {
        tenantId: TENANT,
        propertyId: PROPERTY,
        enabled: true,
        mode: "copilot",
      },
      admin,
    );
    const createConversation = new CreateConversationUseCase(
      conversations,
      permissionChecker,
      ids,
      new MemProperties(property),
    );
    const ingest = new IngestGuestMessageUseCase(
      conversations,
      messages,
      config,
      suggestions,
      escalations,
      usage,
      new MemProperties(property),
      new FailingGemini("gemini_unavailable"),
      ids,
      permissionChecker,
    );
    const conv = (
      await createConversation.execute(
        { tenantId: TENANT, propertyId: PROPERTY },
        admin,
      )
    ).getValue();
    const result = (
      await ingest.execute(
        {
          tenantId: TENANT,
          conversationId: conv.id,
          body: "What is the wifi password?",
        },
        admin,
      )
    ).getValue();
    expect(result.autoSent).toBe(false);
    expect(result.suggestion?.suggestedBody).toBeNull();
    expect(result.suggestion?.status).toBe("failed");
  });
});

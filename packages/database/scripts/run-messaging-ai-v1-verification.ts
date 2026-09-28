/**
 * Messaging + AI Guest Receptionist V1 — authorized demo DB verification.
 * Creates isolated msg-ai-v1-* tenants only; cleans them up.
 * Proves A–F flows + RLS isolation. Does not touch Units/RatePlans/CM/ARI.
 *
 * Load dotenv BEFORE @hcp/database so Prisma binds RUNTIME_DATABASE_URL.
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

async function main(): Promise<void> {
  const {
    Property,
    HeuristicAssistantProvider,
    UnavailableAssistantProvider,
    isAssistantProviderFailureReason,
    PermissionChecker,
    CreateConversationUseCase,
    IngestGuestMessageUseCase,
    ResolveOwnerEscalationUseCase,
    SaveEscalationToKnowledgeUseCase,
    UpsertPropertyAssistantProfileUseCase,
    UpsertPropertyGuestKnowledgeUseCase,
  } = await import("@hcp/domain");
  const {
    prisma,
    clearTenantContext,
    withTenantTransaction,
    UuidIdGenerator,
    PrismaPropertyRepository,
    PrismaOutboxRepository,
    PrismaConversationRepository,
    PrismaMessageRepository,
    PrismaPropertyAssistantConfigRepository,
    PrismaAiSuggestionRepository,
    PrismaOwnerEscalationRepository,
    PrismaAiUsageRepository,
    PrismaPropertyAmenityReader,
    assertNotTalosProductionDatabase,
    isTalosProductionDatabaseUrl,
  } = await import("../src/index.js");

  type ActorContext = import("@hcp/domain").ActorContext;

  const TENANT_A = randomUUID();
  const TENANT_B = randomUUID();
  const PROP_A = randomUUID();
  const PROP_B = randomUUID();
  const UNIT_A = randomUUID();
  const slugA = `msg-ai-v1-${TENANT_A.slice(0, 8)}`;
  const slugB = `msg-ai-v1-${TENANT_B.slice(0, 8)}`;

  const dbUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
  if (
    isTalosProductionDatabaseUrl(dbUrl) ||
    isTalosProductionDatabaseUrl(process.env.DATABASE_URL)
  ) {
    if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
      assertNotTalosProductionDatabase(dbUrl, "messaging-ai-v1-verify");
    }
  }

  const ids = new UuidIdGenerator();
  const outbox = new PrismaOutboxRepository();
  const properties = new PrismaPropertyRepository(outbox);
  const conversations = new PrismaConversationRepository();
  const messages = new PrismaMessageRepository();
  const config = new PrismaPropertyAssistantConfigRepository();
  const suggestions = new PrismaAiSuggestionRepository();
  const escalations = new PrismaOwnerEscalationRepository();
  const usage = new PrismaAiUsageRepository();
  const amenityReader = new PrismaPropertyAmenityReader();
  const permissionChecker = new PermissionChecker();
  const assistant = new HeuristicAssistantProvider();

  const actorA: ActorContext = {
    userId: randomUUID(),
    role: "admin",
    propertyIds: null,
    isSuperAdmin: false,
  };

  const results: Record<string, unknown> = {};

  await clearTenantContext(prisma);
  await prisma.tenant.createMany({
    data: [
      { id: TENANT_A, name: "MsgAI Verify A", slug: slugA },
      { id: TENANT_B, name: "MsgAI Verify B", slug: slugB },
    ],
  });
  await prisma.user.create({
    data: {
      id: actorA.userId,
      email: `msg-ai-v1-${TENANT_A.slice(0, 8)}@demo.test`,
      name: "MsgAI Verifier",
      passwordHash: null,
    },
  });
  await withTenantTransaction(TENANT_A, async (tx) => {
    await tx.membership.create({
      data: {
        id: randomUUID(),
        tenantId: TENANT_A,
        userId: actorA.userId,
        role: "admin",
      },
    });
  });

  const unitCountBefore = await prisma.unit.count();
  const ratePlanCountBefore = await prisma.ratePlan.count();
  const blockCountBefore = await prisma.unitCalendarBlock.count();

  try {
    const rls = await prisma.$queryRaw<
      Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'conversations'
    `;
    results.rlsEnabled = rls[0]?.relrowsecurity === true;
    results.rlsForced = rls[0]?.relforcerowsecurity === true;

    const propA = Property.create({
      id: PROP_A,
      tenantId: TENANT_A,
      name: "MsgAI Villa A",
      slug: `villa-a-${TENANT_A.slice(0, 8)}`,
      type: "villa",
      timezone: "Europe/Athens",
      defaultUnit: { id: UNIT_A },
    });
    await properties.save(propA);

    const propB = Property.create({
      id: PROP_B,
      tenantId: TENANT_B,
      name: "MsgAI Villa B",
      slug: `villa-b-${TENANT_B.slice(0, 8)}`,
      type: "villa",
      timezone: "Europe/Athens",
      defaultUnit: { id: randomUUID() },
    });
    await properties.save(propB);

    const upsertProfile = new UpsertPropertyAssistantProfileUseCase(
      config,
      permissionChecker,
      ids,
    );
    const upsertKnowledge = new UpsertPropertyGuestKnowledgeUseCase(
      config,
      permissionChecker,
      ids,
    );
    const createConversation = new CreateConversationUseCase(
      conversations,
      permissionChecker,
      ids,
      properties,
    );
    const ingest = new IngestGuestMessageUseCase(
      conversations,
      messages,
      config,
      suggestions,
      escalations,
      usage,
      properties,
      assistant,
      ids,
      permissionChecker,
    );
    const resolve = new ResolveOwnerEscalationUseCase(
      escalations,
      conversations,
      messages,
      config,
      suggestions,
      usage,
      properties,
      assistant,
      ids,
      permissionChecker,
    );
    const saveKnowledge = new SaveEscalationToKnowledgeUseCase(
      escalations,
      config,
      permissionChecker,
      ids,
    );

    await upsertProfile.execute(
      {
        tenantId: TENANT_A,
        propertyId: PROP_A,
        enabled: true,
        mode: "autopilot",
      },
      actorA,
    );
    await upsertKnowledge.execute(
      {
        tenantId: TENANT_A,
        propertyId: PROP_A,
        patch: {
          wifiSsid: "MsgAiDemo",
          wifiPassword: "demo-pass-verify",
          earlyCheckInPolicy:
            "Early arrival before 15:00 requires owner approval.",
        },
      },
      actorA,
    );

    // A — Wi-Fi autopilot
    const convA = (
      await createConversation.execute(
        { tenantId: TENANT_A, propertyId: PROP_A, subject: "A wifi" },
        actorA,
      )
    ).getValue();
    const a = (
      await ingest.execute(
        {
          tenantId: TENANT_A,
          conversationId: convA.id,
          body: "What is the wifi password?",
        },
        actorA,
      )
    ).getValue();
    results.A_autoSent = a.autoSent;
    results.A_hasWifi = !!a.sentMessage?.body.includes("demo-pass-verify");
    results.A_classification = a.suggestion?.classification;

    // B — early check-in
    const convB = (
      await createConversation.execute(
        { tenantId: TENANT_A, propertyId: PROP_A, subject: "B early" },
        actorA,
      )
    ).getValue();
    const bIn = (
      await ingest.execute(
        {
          tenantId: TENANT_A,
          conversationId: convB.id,
          body: "Can I arrive at 12:00?",
        },
        actorA,
      )
    ).getValue();
    const knowledgeBeforeB = await config.getKnowledge(TENANT_A, PROP_A);
    const bRes = (
      await resolve.execute(
        {
          tenantId: TENANT_A,
          escalationId: bIn.escalation!.id,
          ownerReply: "Ναι, πες του ότι μπορεί.",
          send: true,
        },
        actorA,
      )
    ).getValue();
    const knowledgeAfterB = await config.getKnowledge(TENANT_A, PROP_A);
    results.B_classification = bIn.suggestion?.classification;
    results.B_escalated = !!bIn.escalation;
    results.B_polished = !!bRes.sentMessage?.body && !bRes.sentMessage.body.includes("πες του");
    results.B_knowledgeUnchanged =
      knowledgeBeforeB?.earlyCheckInPolicy ===
      knowledgeAfterB?.earlyCheckInPolicy;

    // C — unknown
    const convC = (
      await createConversation.execute(
        { tenantId: TENANT_A, propertyId: PROP_A, subject: "C unknown" },
        actorA,
      )
    ).getValue();
    const c = (
      await ingest.execute(
        {
          tenantId: TENANT_A,
          conversationId: convC.id,
          body: "Do you have a private helipad?",
        },
        actorA,
      )
    ).getValue();
    results.C_unknown = c.suggestion?.classification === "UNKNOWN";
    results.C_noAuto = c.autoSent === false;
    results.C_escalated = !!c.escalation;

    // D — save to knowledge explicit
    const knowledgeBeforeD = await config.getKnowledge(TENANT_A, PROP_A);
    const dRes = (
      await resolve.execute(
        {
          tenantId: TENANT_A,
          escalationId: c.escalation!.id,
          ownerReply: "No helipad — nearest airport is 40 minutes away.",
          send: true,
        },
        actorA,
      )
    ).getValue();
    results.D_offered = dRes.saveToKnowledgeOffered === true;
    results.D_unchangedBeforeConfirm =
      (await config.getKnowledge(TENANT_A, PROP_A))?.recommendations ===
      knowledgeBeforeD?.recommendations;
    await saveKnowledge.execute(
      {
        tenantId: TENANT_A,
        escalationId: c.escalation!.id,
        confirm: true,
        patch: {
          recommendations: "No helipad. Nearest airport is 40 minutes away.",
        },
      },
      actorA,
    );
    results.D_saved =
      (await config.getKnowledge(TENANT_A, PROP_A))?.recommendations?.includes(
        "helipad",
      ) === true;

    // E — RLS cross-tenant
    const crossRead = await withTenantTransaction(TENANT_B, async (tx) => {
      return tx.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT count(*)::int AS c FROM conversations WHERE id = $1::uuid`,
        convA.id,
      );
    });
    results.E_crossTenantConvCount = crossRead[0]?.c ?? -1;

    const knowledgeLeak = await withTenantTransaction(TENANT_B, async (tx) => {
      return tx.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT count(*)::int AS c FROM property_guest_knowledge WHERE property_id = $1::uuid`,
        PROP_A,
      );
    });
    results.E_crossTenantKnowledgeCount = knowledgeLeak[0]?.c ?? -1;

    // F — provider unavailable
    const ingestFail = new IngestGuestMessageUseCase(
      conversations,
      messages,
      config,
      suggestions,
      escalations,
      usage,
      properties,
      new UnavailableAssistantProvider(),
      ids,
      permissionChecker,
    );
    const convF = (
      await createConversation.execute(
        { tenantId: TENANT_A, propertyId: PROP_A, subject: "F fail" },
        actorA,
      )
    ).getValue();
    const f = (
      await ingestFail.execute(
        {
          tenantId: TENANT_A,
          conversationId: convF.id,
          body: "What is the wifi password?",
        },
        actorA,
      )
    ).getValue();
    results.F_inboundDurable = f.inboundMessage.body.includes("wifi");
    results.F_noAuto = f.autoSent === false;
    results.F_failedSuggestion = f.suggestion?.status === "failed";
    results.F_escalated = !!f.escalation;
    results.F_providerFailureReason = isAssistantProviderFailureReason(
      f.escalation?.reason,
    );
    results.F_noHeuristicBody = f.suggestion?.suggestedBody == null;

    // G — amenities: pool presence + wifi amenity without password + isolation
    const poolAmenityId = randomUUID();
    const wifiAmenityId = randomUUID();
    await clearTenantContext(prisma);
    await prisma.amenity.createMany({
      data: [
        { id: poolAmenityId, tenantId: TENANT_A, name: "Pool" },
        { id: wifiAmenityId, tenantId: TENANT_A, name: "Wi-Fi" },
      ],
    });
    await withTenantTransaction(TENANT_A, async (tx) => {
      await tx.propertyAmenity.createMany({
        data: [
          { propertyId: PROP_A, amenityId: poolAmenityId },
          { propertyId: PROP_A, amenityId: wifiAmenityId },
        ],
      });
    });

    const amenitiesA = await amenityReader.listForProperty(TENANT_A, PROP_A);
    const amenitiesWrongTenant = await amenityReader.listForProperty(
      TENANT_B,
      PROP_A,
    );
    const amenitiesWrongProperty = await amenityReader.listForProperty(
      TENANT_A,
      PROP_B,
    );
    results.G_amenitiesLoaded = amenitiesA.some((a) => a.name === "Pool");
    results.G_crossTenantAmenities = amenitiesWrongTenant.length;
    results.G_crossPropertyAmenities = amenitiesWrongProperty.length;

    const convPool = (
      await createConversation.execute(
        { tenantId: TENANT_A, propertyId: PROP_A, subject: "G pool" },
        actorA,
      )
    ).getValue();
    const poolAsk = (
      await ingest.execute(
        {
          tenantId: TENANT_A,
          conversationId: convPool.id,
          body: "Do you have a pool?",
          amenities: amenitiesA,
        },
        actorA,
      )
    ).getValue();
    results.G_poolAnswerable = poolAsk.suggestion?.classification === "ANSWERABLE";
    results.G_poolAutoSent = poolAsk.autoSent === true;
    results.G_poolGrounded =
      poolAsk.suggestion?.knowledgeSourceIds.some((id) =>
        id.startsWith("amenity:"),
      ) === true;

    // Clear wifi password knowledge; amenity alone must not invent password.
    await upsertKnowledge.execute(
      {
        tenantId: TENANT_A,
        propertyId: PROP_A,
        patch: { wifiSsid: null, wifiPassword: null },
      },
      actorA,
    );
    const convWifi = (
      await createConversation.execute(
        { tenantId: TENANT_A, propertyId: PROP_A, subject: "G wifi pw" },
        actorA,
      )
    ).getValue();
    const wifiAsk = (
      await ingest.execute(
        {
          tenantId: TENANT_A,
          conversationId: convWifi.id,
          body: "What is the wifi password?",
          amenities: amenitiesA,
        },
        actorA,
      )
    ).getValue();
    results.G_wifiNoPasswordUnknown =
      wifiAsk.suggestion?.classification === "UNKNOWN";
    results.G_wifiNoPasswordNoAuto = wifiAsk.autoSent === false;

    results.unitsUnchanged = (await prisma.unit.count()) === unitCountBefore + 2;
    results.ratePlansUnchanged =
      (await prisma.ratePlan.count()) === ratePlanCountBefore;
    results.calendarBlocksUnchanged =
      (await prisma.unitCalendarBlock.count()) === blockCountBefore;

    const pass =
      results.A_autoSent === true &&
      results.A_hasWifi === true &&
      results.B_classification === "REQUIRES_OWNER_DECISION" &&
      results.B_polished === true &&
      results.B_knowledgeUnchanged === true &&
      results.C_unknown === true &&
      results.C_noAuto === true &&
      results.D_offered === true &&
      results.D_saved === true &&
      results.E_crossTenantConvCount === 0 &&
      results.E_crossTenantKnowledgeCount === 0 &&
      results.F_inboundDurable === true &&
      results.F_failedSuggestion === true &&
      results.F_providerFailureReason === true &&
      results.F_noHeuristicBody === true &&
      results.G_amenitiesLoaded === true &&
      results.G_crossTenantAmenities === 0 &&
      results.G_crossPropertyAmenities === 0 &&
      results.G_poolAnswerable === true &&
      results.G_poolAutoSent === true &&
      results.G_poolGrounded === true &&
      results.G_wifiNoPasswordUnknown === true &&
      results.G_wifiNoPasswordNoAuto === true &&
      results.rlsEnabled === true &&
      results.rlsForced === true &&
      results.ratePlansUnchanged === true &&
      results.calendarBlocksUnchanged === true;

    console.log(JSON.stringify({ pass, results }, null, 2));
    if (!pass) process.exit(1);
  } finally {
    await clearTenantContext(prisma);
    await prisma.tenant.deleteMany({
      where: { id: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.user.deleteMany({
      where: { id: actorA.userId },
    });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ChannelConnection,
  ChannelListingMapping,
  CredentialReference,
  EnqueueJobUseCase,
  InMemoryChannelCredentialVault,
  PermissionChecker,
  RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
  ReconcileIcalImportedInventoryJobHandler,
  ReconcileIcalImportedInventoryUseCase,
  RotateIcalConnectionCredentialsUseCase,
  UpsertChannelListingMappingUseCase,
  buildIcalInventoryReconcilePrimaryJobKey,
} from "@hcp/domain";
import {
  PrismaBackgroundJobRepository,
  PrismaChannelConnectionRepository,
  PrismaChannelInventoryReconciliationApplyStore,
  PrismaChannelListingMappingRepository,
  PrismaChannelPollCursorRepository,
  PrismaChannelPollInventoryCommitStore,
  PrismaIcalChannelMappingLifecycleStore,
  PrismaIcalCredentialRotationStore,
  PrismaJobScheduler,
} from "../../src";
import { prisma, setTenantContext } from "./helpers";
import { integrationDatabaseConfigured } from "./integrationGate";

const runIntegration = integrationDatabaseConfigured
  ? (title: string, fn: () => void) =>
      describe(title, { hookTimeout: 180_000, timeout: 180_000 }, fn)
  : describe.skip;

const INTEGRATION_TX_OPTIONS = { maxWait: 20_000, timeout: 60_000 } as const;

const TENANT = "550e8400-e29b-41d4-a716-446655440c10";
const ACTOR = "550e8400-e29b-41d4-a716-446655440c11";
const PROPERTY_P1 = "550e8400-e29b-41d4-a716-446655440c12";
const PROPERTY_P2 = "550e8400-e29b-41d4-a716-446655440c13";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440c14";
const CONNECTION_ID = "s6c-closure-connection";
const MAPPING_ID = "s6c-closure-mapping";

const SOURCE_IDENTITY = "src-closure-a";
const ENTRY_HASH = "a".repeat(64);
const SNAPSHOT_HASH = "b".repeat(64);

const adminActor = { userId: ACTOR, role: "admin" as const, propertyIds: null };
const auditContext = { actorId: ACTOR, ipAddress: "127.0.0.1" };

function unchangedFeedSnapshot() {
  const item = {
    sourceIdentityKey: SOURCE_IDENTITY,
    entryContentHash: ENTRY_HASH,
    identityKind: "uid_only" as const,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
  };
  const compact = [
    {
      i: item.sourceIdentityKey,
      h: item.entryContentHash,
      k: 1 as const,
      s: item.checkIn,
      e: item.checkOut,
    },
  ];
  const canonicalJson = JSON.stringify(compact);
  return {
    snapshotHash: SNAPSHOT_HASH,
    items: [item],
    canonicalJson,
    utf8ByteLength: Buffer.byteLength(canonicalJson, "utf8"),
    completeObservedEvidence: true as const,
    observedSourceIdentityKeys: [item.sourceIdentityKey],
    cancelledSourceIdentityKeys: [] as string[],
    compact,
  };
}

function emptyBatch(cursor: string) {
  return {
    ackAllowed: true as const,
    results: [] as [],
    proposedNextCursor: cursor,
  };
}

async function resetGraph(): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "channel_ical_credential_rotation_commands"
    WHERE "tenant_id" = ${TENANT}::uuid
  `;
  await prisma.auditLog.deleteMany({ where: { actorId: ACTOR } });
  await prisma.backgroundJob.deleteMany({ where: { tenantId: TENANT } });
  await prisma.outboxEvent.deleteMany({ where: { tenantId: TENANT } });
  await prisma.channelInventoryReconciliation.deleteMany({ where: { tenantId: TENANT } });
  await prisma.unitCalendarBlock.deleteMany({ where: { tenantId: TENANT } });
  await prisma.channelPollCursor.deleteMany({ where: { tenantId: TENANT } });
  await prisma.channelListingMapping.deleteMany({ where: { tenantId: TENANT } });
  await prisma.channelConnection.deleteMany({ where: { tenantId: TENANT } });
  await prisma.unit.deleteMany({ where: { tenantId: TENANT } });
  await prisma.property.deleteMany({ where: { tenantId: TENANT } });
  await prisma.user.deleteMany({ where: { id: ACTOR } });
  await prisma.tenant.deleteMany({ where: { id: TENANT } });

  await prisma.tenant.create({
    data: { id: TENANT, name: "S6c Closure", slug: "int-s6c-closure" },
  });
  await prisma.user.create({
    data: { id: ACTOR, email: "s6c-closure@integration.test", name: "S6c Closure" },
  });
  await prisma.property.createMany({
    data: [
      {
        id: PROPERTY_P1,
        tenantId: TENANT,
        name: "Closure P1",
        slug: "s6c-closure-p1",
        status: "active",
        timezone: "UTC",
      },
      {
        id: PROPERTY_P2,
        tenantId: TENANT,
        name: "Closure P2",
        slug: "s6c-closure-p2",
        status: "active",
        timezone: "UTC",
      },
    ],
  });
  await prisma.unit.create({
    data: {
      id: UNIT_ID,
      tenantId: TENANT,
      propertyId: PROPERTY_P1,
      name: "Closure Unit",
      slug: "s6c-closure-unit",
      status: "active",
      maxGuests: 4,
    },
  });
}

async function seedActiveIcalConnection(
  connections: PrismaChannelConnectionRepository,
  mappings: PrismaChannelListingMappingRepository,
): Promise<void> {
  const connection = ChannelConnection.createDraft({
    id: CONNECTION_ID,
    tenantId: TENANT,
    provider: "ical",
    displayName: "S6c Closure",
  });
  connection.attachCredentials(CredentialReference.create("cred_s6c_closure"));
  connection.activate();
  await connections.create(connection);
  connection.applySemanticModeChange("availability_block_feed");
  await connections.persistSemanticState({
    tenantId: TENANT,
    connectionId: CONNECTION_ID,
    expectedSemanticConfigVersion: 1,
    semanticMode: connection.semanticMode,
    semanticConfigVersion: connection.semanticConfigVersion,
    updatedAt: new Date(),
  });
  await mappings.save(
    ChannelListingMapping.createActive({
      id: MAPPING_ID,
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      externalListingId: "ext-closure",
      propertyId: PROPERTY_P1,
      unitId: UNIT_ID,
      syncDirection: "inbound",
    }),
  );
  await prisma.channelConnection.update({
    where: { tenantId_id: { tenantId: TENANT, id: CONNECTION_ID } },
    data: { inventoryApplyEnabled: true },
  });
}

runIntegration("P1-S6c final targeted PostgreSQL closure proofs", () => {
  const connections = new PrismaChannelConnectionRepository();
  const mappings = new PrismaChannelListingMappingRepository();
  const cursors = new PrismaChannelPollCursorRepository(prisma, INTEGRATION_TX_OPTIONS);
  const permissionChecker = new PermissionChecker();
  const commitStore = new PrismaChannelPollInventoryCommitStore(
    prisma,
    {},
    INTEGRATION_TX_OPTIONS,
    () => true,
  );
  const applyStore = new PrismaChannelInventoryReconciliationApplyStore(
    prisma,
    {},
    INTEGRATION_TX_OPTIONS,
    () => true,
  );

  beforeEach(async () => {
    await resetGraph();
    await seedActiveIcalConnection(connections, mappings);
  });

  afterAll(async () => {
    await resetGraph();
    await prisma.$disconnect();
  });

  it("Proof 1 — property-only + unchanged feed → N+1 generation → TX2 property rematerialization", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      const snapshot = unchangedFeedSnapshot();
      const epochE = 2;
      const mappingVersionM = 1;

      // Generation N via TX1 + TX2 with property P1.
      const first = await commitStore.commit({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        provider: "ical",
        observedSemanticConfigVersion: epochE,
        expectedCursorVersion: 0,
        proposedNextCursor: "closure-cursor-n",
        inventorySnapshot: snapshot,
        batch: emptyBatch("closure-cursor-n"),
        loadedCursorVersion: 0,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.pollResult.committedCursorVersion).toBe(1);

      const applyN = await applyStore.apply({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        cursorVersion: 1,
      });
      expect(applyN.ok).toBe(true);
      if (!applyN.ok) return;
      expect(applyN.execution).toBe("APPLY");

      await setTenantContext(prisma, TENANT);
      const blockBefore = await prisma.unitCalendarBlock.findMany({
        where: {
          tenantId: TENANT,
          blockType: "channel_import",
          status: "active",
          sourceIdentityKey: SOURCE_IDENTITY,
        },
      });
      expect(blockBefore).toHaveLength(1);
      expect(blockBefore[0]?.propertyId).toBe(PROPERTY_P1);
      const durableBlockId = blockBefore[0]!.id;

      // Property-only mutation: P1 → P2, mappingVersion M → M+1, epoch unchanged.
      const upsert = new UpsertChannelListingMappingUseCase(
        connections,
        mappings,
        new PrismaIcalChannelMappingLifecycleStore(prisma, INTEGRATION_TX_OPTIONS),
        permissionChecker,
        { generate: () => "unused" },
      );
      const mutated = await upsert.execute(
        {
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          mappingId: MAPPING_ID,
          externalListingId: "ext-closure",
          propertyId: PROPERTY_P2,
          unitId: UNIT_ID,
          expectedSemanticConfigVersion: epochE,
        },
        adminActor,
        auditContext,
      );
      expect(mutated.isSuccess).toBe(true);
      expect(mutated.getValue().mutationKind).toBe("property_only");
      expect(mutated.getValue().epochBumped).toBe(false);
      expect(mutated.getValue().mappingVersion).toBe(mappingVersionM + 1);

      const connectionAfter = await connections.findById(TENANT, CONNECTION_ID);
      expect(connectionAfter?.semanticConfigVersion).toBe(epochE);
      const cursorAfterMutation = await cursors.getCursor(TENANT, CONNECTION_ID);
      expect(cursorAfterMutation?.version).toBe(1);
      expect(cursorAfterMutation?.payload).toBe("closure-cursor-n");

      // Successful inventory poll with unchanged remote snapshot → N+1.
      const second = await commitStore.commit({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        provider: "ical",
        observedSemanticConfigVersion: epochE,
        expectedCursorVersion: 1,
        proposedNextCursor: "closure-cursor-n-plus-1",
        inventorySnapshot: snapshot,
        batch: emptyBatch("closure-cursor-n-plus-1"),
        loadedCursorVersion: 1,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.pollResult.committedCursorVersion).toBe(2);
      expect(second.pollResult.cursorReconciliation).toBe("advanced");

      await setTenantContext(prisma, TENANT);
      const genN1 = await prisma.channelInventoryReconciliation.findUnique({
        where: {
          tenantId_connectionId_cursorVersion: {
            tenantId: TENANT,
            connectionId: CONNECTION_ID,
            cursorVersion: 2,
          },
        },
      });
      expect(genN1).not.toBeNull();
      expect(genN1?.semanticConfigVersion).toBe(epochE);
      expect(genN1?.mappingVersion).toBe(mappingVersionM + 1);
      expect(genN1?.propertyId).toBe(PROPERTY_P2);
      expect(genN1?.unitId).toBe(UNIT_ID);
      expect(genN1?.snapshotHash).toBe(SNAPSHOT_HASH);
      expect(genN1?.reconcileStatus).toBe("pending");

      const applyN1 = await applyStore.apply({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        cursorVersion: 2,
      });
      expect(applyN1.ok).toBe(true);
      if (!applyN1.ok) return;
      expect(applyN1.execution).toBe("APPLY");

      const blocksAfter = await prisma.unitCalendarBlock.findMany({
        where: {
          tenantId: TENANT,
          blockType: "channel_import",
          status: "active",
          sourceIdentityKey: SOURCE_IDENTITY,
        },
      });
      expect(blocksAfter).toHaveLength(1);
      expect(blocksAfter[0]?.id).toBe(durableBlockId);
      expect(blocksAfter[0]?.propertyId).toBe(PROPERTY_P2);
      expect(blocksAfter[0]?.unitId).toBe(UNIT_ID);
      expect(blocksAfter[0]?.connectionId).toBe(CONNECTION_ID);
      expect(blocksAfter[0]?.semanticConfigVersion).toBe(epochE);
      expect(blocksAfter[0]?.mappingId).toBe(MAPPING_ID);
      expect(blocksAfter[0]?.sourceIdentityKey).toBe(SOURCE_IDENTITY);

      expect(
        await prisma.unitCalendarBlock.count({
          where: { tenantId: TENANT, blockType: "channel_import", status: "active" },
        }),
      ).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
    }
  });

  it("Proof 2 — queued old-epoch TX2 after rotation → zero stale inventory writes", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      const snapshot = unchangedFeedSnapshot();
      const epochE = 2;

      // Pre-existing applied old-epoch evidence (V1 no-removal may retain it).
      await setTenantContext(prisma, TENANT);
      await prisma.$executeRaw`
        INSERT INTO "unit_calendar_blocks" (
          "id","tenant_id","unit_id","property_id","block_type","source_id",
          "check_in","check_out","status",
          "connection_id","semantic_config_version","mapping_id",
          "source_identity_key","entry_content_hash","identity_kind",
          "created_at","updated_at"
        ) VALUES (
          gen_random_uuid(), ${TENANT}::uuid, ${UNIT_ID}::uuid, ${PROPERTY_P1}::uuid,
          'channel_import'::"CalendarBlockType", NULL,
          '2026-01-01'::date, '2026-01-02'::date, 'active'::"CalendarBlockStatus",
          ${CONNECTION_ID}, ${epochE}, ${MAPPING_ID},
          'src-pre-rotation', ${"c".repeat(64)}, 'uid_only',
          NOW(), NOW()
        )
      `;
      const blocksBeforeRotation = await prisma.unitCalendarBlock.count({
        where: { tenantId: TENANT, blockType: "channel_import", status: "active" },
      });
      expect(blocksBeforeRotation).toBe(1);

      // Pending generation G_E with distinct identity (would write if applied).
      await prisma.channelInventoryReconciliation.create({
        data: {
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          cursorVersion: 7,
          semanticConfigVersion: epochE,
          mappingId: MAPPING_ID,
          mappingVersion: 1,
          unitId: UNIT_ID,
          propertyId: PROPERTY_P1,
          snapshotHash: SNAPSHOT_HASH,
          actionableSnapshot: snapshot.compact,
          reconcileStatus: "pending",
          createdAt: new Date(),
        },
      });

      const jobs = new PrismaBackgroundJobRepository();
      const enqueue = new EnqueueJobUseCase(new PrismaJobScheduler(jobs));
      const jobKey = buildIcalInventoryReconcilePrimaryJobKey({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        cursorVersion: 7,
      });
      const enqueued = await enqueue.execute({
        tenantId: TENANT,
        jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
        idempotencyKey: jobKey,
        payload: {
          connectionId: CONNECTION_ID,
          cursorVersion: 7,
          semanticConfigVersion: epochE,
          mappingId: MAPPING_ID,
          mappingVersion: 1,
        },
      });
      expect(enqueued.isSuccess).toBe(true);
      const jobId = enqueued.getValue().id;

      // Real S6c rotation epoch commit (pause → E+1 → baseline → supersede).
      const vault = new InMemoryChannelCredentialVault();
      const rotate = new RotateIcalConnectionCredentialsUseCase(
        connections,
        new PrismaIcalCredentialRotationStore(prisma, {}, INTEGRATION_TX_OPTIONS),
        vault,
        permissionChecker,
      );
      const rotated = await rotate.execute(
        {
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          commandId: "s6c-closure-rot-1",
          material: { feedUrl: "https://feed.example.test/calendar/s6c-closure-rotated.ics" },
          expectedSemanticConfigVersion: epochE,
          reason: "closure proof 2",
        },
        adminActor,
        auditContext,
      );
      expect(rotated.isSuccess).toBe(true);
      expect(rotated.getValue().previousSemanticConfigVersion).toBe(epochE);
      expect(rotated.getValue().resultingSemanticConfigVersion).toBe(epochE + 1);
      expect(rotated.getValue().lifecycleStatus).toBe("paused");

      await setTenantContext(prisma, TENANT);
      const genAfter = await prisma.channelInventoryReconciliation.findUnique({
        where: {
          tenantId_connectionId_cursorVersion: {
            tenantId: TENANT,
            connectionId: CONNECTION_ID,
            cursorVersion: 7,
          },
        },
      });
      expect(genAfter?.reconcileStatus).toBe("superseded");

      const connectionAfter = await connections.findById(TENANT, CONNECTION_ID);
      expect(connectionAfter?.semanticConfigVersion).toBe(epochE + 1);
      expect(connectionAfter?.status).toBe("paused");

      // Execute the already-queued old-epoch job (handler path).
      const job = await jobs.findById(jobId);
      expect(job).not.toBeNull();
      expect(job!.status).toBe("pending");

      const handler = new ReconcileIcalImportedInventoryJobHandler(
        new ReconcileIcalImportedInventoryUseCase(applyStore),
      );
      await handler.run(job!);

      const applyDirect = await applyStore.apply({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        cursorVersion: 7,
        observedSemanticConfigVersion: epochE,
        observedMappingId: MAPPING_ID,
        observedMappingVersion: 1,
      });
      expect(applyDirect.ok).toBe(true);
      if (!applyDirect.ok) return;
      expect(applyDirect.execution).toBe("NOOP");
      expect(applyDirect.reconcileStatus).toBe("superseded");
      expect(applyDirect.createdCount).toBe(0);
      expect(applyDirect.updatedCount).toBe(0);

      await setTenantContext(prisma, TENANT);
      const blocksAfter = await prisma.unitCalendarBlock.findMany({
        where: { tenantId: TENANT, blockType: "channel_import", status: "active" },
      });
      expect(blocksAfter).toHaveLength(blocksBeforeRotation);
      expect(blocksAfter.every((b) => b.sourceIdentityKey !== SOURCE_IDENTITY)).toBe(true);
      expect(blocksAfter.some((b) => b.sourceIdentityKey === "src-pre-rotation")).toBe(true);

      const genFinal = await prisma.channelInventoryReconciliation.findUnique({
        where: {
          tenantId_connectionId_cursorVersion: {
            tenantId: TENANT,
            connectionId: CONNECTION_ID,
            cursorVersion: 7,
          },
        },
      });
      expect(genFinal?.reconcileStatus).toBe("superseded");
      expect((await connections.findById(TENANT, CONNECTION_ID))?.semanticConfigVersion).toBe(
        epochE + 1,
      );

      // Queued job must not be dead-lettered / retried into a storm.
      const jobAfter = await jobs.findById(jobId);
      expect(jobAfter?.status).not.toBe("dead_letter");
      expect(
        await prisma.backgroundJob.count({
          where: {
            tenantId: TENANT,
            jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
          },
        }),
      ).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
    }
  });
});

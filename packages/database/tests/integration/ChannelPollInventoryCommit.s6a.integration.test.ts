import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ChannelListingMapping,
  ExecuteChannelPollConnectionUseCase,
  ICAL_INVENTORY_CAPACITY,
  ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
  buildIcalInventoryReconcileDeliveryKey,
  buildWorstCaseActionableSnapshotJson,
  type ReceiveChannelPollBatchUseCase,
} from "@hcp/domain";
import {
  PrismaChannelConnectionRepository,
  PrismaChannelListingMappingRepository,
  PrismaChannelListingMappingWriteStore,
  PrismaChannelPollCursorRepository,
  PrismaChannelPollInventoryCommitStore,
} from "../../src";
import { prisma, setTenantContext } from "./helpers";
import { runIntegration } from "./integrationGate";


const TENANT = "550e8400-e29b-41d4-a716-446655440600";
const TENANT_B = "550e8400-e29b-41d4-a716-446655440601";
const CONNECTION_ID = "s6a-inv-connection";
const MAPPING_ID = "s6a-inv-mapping";
const PROPERTY_ID = "s6a-prop";
const UNIT_ID = "s6a-unit";

function emptyBatch(cursor: string) {
  return {
    ackAllowed: true as const,
    results: [] as [],
    proposedNextCursor: cursor,
  };
}

function emptySnapshot() {
  return {
    snapshotHash: "a".repeat(64),
    items: [] as const,
    canonicalJson: "[]",
    utf8ByteLength: 2,
    completeObservedEvidence: true as const,
    observedSourceIdentityKeys: [] as string[],
    cancelledSourceIdentityKeys: [] as string[],
  };
}

function nonemptySnapshot() {
  const item = {
    sourceIdentityKey: "id1",
    entryContentHash: "b".repeat(64),
    identityKind: "uid_only" as const,
    checkIn: "2026-01-01",
    checkOut: "2026-01-03",
  };
  const canonicalJson = `{"i":"${item.sourceIdentityKey}","h":"${item.entryContentHash}","k":1,"s":"${item.checkIn}","e":"${item.checkOut}"}`;
  const wrapped = `[${canonicalJson}]`;
  return {
    snapshotHash: "c".repeat(64),
    items: [item],
    canonicalJson: wrapped,
    utf8ByteLength: Buffer.byteLength(wrapped, "utf8"),
    completeObservedEvidence: true as const,
    observedSourceIdentityKeys: [item.sourceIdentityKey],
    cancelledSourceIdentityKeys: [] as string[],
  };
}

async function seedConnection(
  tenantId: string,
  connectionId: string,
  options: { semanticMode?: string; status?: string; inventoryApplyEnabled?: boolean } = {},
) {
  await prisma.channelConnection.create({
    data: {
      tenantId,
      id: connectionId,
      provider: "ical",
      displayName: "S6a connection",
      status: (options.status ?? "active") as "active",
      semanticMode: (options.semanticMode ?? "availability_block_feed") as "availability_block_feed",
      semanticConfigVersion: 1,
      inventoryApplyEnabled: options.inventoryApplyEnabled !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

runIntegration("P1-S6a PrismaChannelPollInventoryCommitStore / mapping serialization", () => {
  const mappingRepo = new PrismaChannelListingMappingRepository();
  const mappingWriteStore = new PrismaChannelListingMappingWriteStore();

  beforeEach(async () => {
    await prisma.outboxEvent.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.channelInventoryReconciliation.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.channelPollCursor.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.channelListingMapping.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.channelConnection.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await seedConnection(TENANT, CONNECTION_ID);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.channelInventoryReconciliation.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.channelPollCursor.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.channelListingMapping.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.channelConnection.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.$disconnect();
  });

  it("empty snapshot: cursor+pending generation + outbox; committedCursorVersion explicit", async () => {
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );

    const store = new PrismaChannelPollInventoryCommitStore(prisma, {}, undefined, () => true);
    const result = await store.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      proposedNextCursor: "cursor-empty",
      inventorySnapshot: emptySnapshot(),
      batch: emptyBatch("cursor-empty"),
      loadedCursorVersion: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pollResult.committedCursorVersion).toBe(1);
    expect(result.pollResult.cursorReconciliation).toBe("advanced");

    await setTenantContext(prisma, TENANT);
    const generations = await prisma.channelInventoryReconciliation.findMany({
      where: { tenantId: TENANT, connectionId: CONNECTION_ID },
    });
    expect(generations).toHaveLength(1);
    expect(generations[0]?.reconcileStatus).toBe("pending");
    expect(generations[0]?.completeObservedEvidence).toBe(true);
    expect(generations[0]?.observedSourceIdentityKeys).toEqual([]);
    const outbox = await prisma.outboxEvent.findMany({
      where: {
        tenantId: TENANT,
        eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
      },
    });
    expect(outbox).toHaveLength(1);
  });

  it("non-empty snapshot: pending generation + outbox with delivery key uniqueness", async () => {
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );

    const store = new PrismaChannelPollInventoryCommitStore(prisma, {}, undefined, () => true);
    const result = await store.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      proposedNextCursor: "cursor-pending",
      inventorySnapshot: nonemptySnapshot(),
      batch: emptyBatch("cursor-pending"),
      loadedCursorVersion: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await setTenantContext(prisma, TENANT);
    const gen = await prisma.channelInventoryReconciliation.findFirst({
      where: { tenantId: TENANT, connectionId: CONNECTION_ID },
    });
    expect(gen?.reconcileStatus).toBe("pending");
    const outbox = await prisma.outboxEvent.findMany({
      where: {
        tenantId: TENANT,
        eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
      },
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.deliveryKey).toMatch(/^[0-9a-f]{64}$/);
    const expectedKey = buildIcalInventoryReconcileDeliveryKey({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
      semanticConfigVersion: 1,
      mappingId: MAPPING_ID,
      mappingVersion: 1,
    });
    expect(outbox[0]?.deliveryKey).toBe(expectedKey);
  });

  it("Finding A — flag OFF via orchestration: P1-S5 cursor advances; zero generation/outbox", async () => {
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );

    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "false";
    try {
      const connections = new PrismaChannelConnectionRepository();
      const cursors = new PrismaChannelPollCursorRepository();
      const commitStore = new PrismaChannelPollInventoryCommitStore(
        prisma,
        {},
        undefined,
        () => false,
      );
      const pollBatchUseCase = {
        execute: async () => ({
          ackAllowed: true as const,
          results: [] as [],
          proposedNextCursor: "cursor-flag-off",
          inventoryActionableSnapshot: nonemptySnapshot(),
          inventoryProjectionFailureCode: null,
        }),
      } as unknown as ReceiveChannelPollBatchUseCase;

      const useCase = new ExecuteChannelPollConnectionUseCase(
        connections,
        cursors,
        pollBatchUseCase,
        commitStore,
      );
      const result = await useCase.execute({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
      });

      expect(result.cursorAdvanced).toBe(true);
      expect(result.cursorReconciliation).toBe("advanced");
      expect(result.committedCursorVersion).toBe(1);

      await setTenantContext(prisma, TENANT);
      const cursor = await prisma.channelPollCursor.findUnique({
        where: {
          tenantId_connectionId: { tenantId: TENANT, connectionId: CONNECTION_ID },
        },
      });
      expect(cursor?.version).toBe(1);
      expect(cursor?.payload).toBe("cursor-flag-off");
      expect(
        await prisma.channelInventoryReconciliation.count({ where: { tenantId: TENANT } }),
      ).toBe(0);
      expect(
        await prisma.outboxEvent.count({
          where: { tenantId: TENANT, eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE },
        }),
      ).toBe(0);
    } finally {
      if (previous === undefined) {
        delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      } else {
        process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
      }
    }
  });

  it("commit-store flag OFF refuses TX1 without mutating cursor (orchestration uses S5 path instead)", async () => {
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );
    const store = new PrismaChannelPollInventoryCommitStore(prisma, {}, undefined, () => false);
    const result = await store.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      proposedNextCursor: "cursor-off",
      inventorySnapshot: emptySnapshot(),
      batch: emptyBatch("cursor-off"),
      loadedCursorVersion: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("inventory_apply_disabled");
    await setTenantContext(prisma, TENANT);
    expect(await prisma.channelPollCursor.count({ where: { tenantId: TENANT } })).toBe(0);
    expect(await prisma.channelInventoryReconciliation.count({ where: { tenantId: TENANT } })).toBe(
      0,
    );
  });

  it("Finding B — OFF→ON same-feed baseline + already_committed idempotent backfill", async () => {
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );

    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    const snap = nonemptySnapshot();
    const connections = new PrismaChannelConnectionRepository();
    const cursors = new PrismaChannelPollCursorRepository();
    const pollBatchUseCase = {
      execute: async () => ({
        ackAllowed: true as const,
        results: [] as [],
        proposedNextCursor: "snapshot-A",
        inventoryActionableSnapshot: snap,
        inventoryProjectionFailureCode: null,
      }),
    } as unknown as ReceiveChannelPollBatchUseCase;

    try {
      process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "false";
      const offStore = new PrismaChannelPollInventoryCommitStore(
        prisma,
        {},
        undefined,
        () => false,
      );
      const offResult = await new ExecuteChannelPollConnectionUseCase(
        connections,
        cursors,
        pollBatchUseCase,
        offStore,
      ).execute({ tenantId: TENANT, connectionId: CONNECTION_ID });
      expect(offResult.committedCursorVersion).toBe(1);
      await setTenantContext(prisma, TENANT);
      expect(
        await prisma.channelInventoryReconciliation.count({ where: { tenantId: TENANT } }),
      ).toBe(0);

      process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
      const onStore = new PrismaChannelPollInventoryCommitStore(prisma, {}, undefined, () => true);
      const onResult = await new ExecuteChannelPollConnectionUseCase(
        connections,
        cursors,
        pollBatchUseCase,
        onStore,
      ).execute({ tenantId: TENANT, connectionId: CONNECTION_ID });
      expect(onResult.cursorAdvanced).toBe(true);
      expect(onResult.committedCursorVersion).toBe(2);

      await setTenantContext(prisma, TENANT);
      expect(
        await prisma.channelInventoryReconciliation.count({ where: { tenantId: TENANT } }),
      ).toBe(1);
      expect(
        await prisma.outboxEvent.count({
          where: { tenantId: TENANT, eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE },
        }),
      ).toBe(1);

      // already_committed retry for same payload — no duplicate generation/outbox
      const retry = await onStore.commit({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        provider: "ical",
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 0,
        proposedNextCursor: "snapshot-A",
        inventorySnapshot: snap,
        batch: emptyBatch("snapshot-A"),
        loadedCursorVersion: 0,
      });
      expect(retry.ok).toBe(true);
      if (!retry.ok) return;
      expect(retry.pollResult.cursorReconciliation).toBe("already_committed");
      expect(retry.pollResult.committedCursorVersion).toBe(2);
      expect(
        await prisma.channelInventoryReconciliation.count({ where: { tenantId: TENANT } }),
      ).toBe(1);
      expect(
        await prisma.outboxEvent.count({
          where: { tenantId: TENANT, eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE },
        }),
      ).toBe(1);
    } finally {
      if (previous === undefined) {
        delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      } else {
        process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
      }
    }
  });

  it("Finding B — already_committed with no generation backfills for committed version N", async () => {
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );
    const cursors = new PrismaChannelPollCursorRepository();
    await cursors.advanceCursor({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "snapshot-A",
    });

    const store = new PrismaChannelPollInventoryCommitStore(prisma, {}, undefined, () => true);
    const snap = nonemptySnapshot();
    const first = await store.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      proposedNextCursor: "snapshot-A",
      inventorySnapshot: snap,
      batch: emptyBatch("snapshot-A"),
      loadedCursorVersion: 0,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.pollResult.cursorReconciliation).toBe("already_committed");
    expect(first.pollResult.committedCursorVersion).toBe(1);

    await setTenantContext(prisma, TENANT);
    const gens = await prisma.channelInventoryReconciliation.findMany({
      where: { tenantId: TENANT, connectionId: CONNECTION_ID },
    });
    expect(gens).toHaveLength(1);
    expect(gens[0]?.cursorVersion).toBe(1);
    expect(gens[0]?.reconcileStatus).toBe("pending");
    expect(
      await prisma.outboxEvent.count({
        where: { tenantId: TENANT, eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE },
      }),
    ).toBe(1);

    const second = await store.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      proposedNextCursor: "snapshot-A",
      inventorySnapshot: snap,
      batch: emptyBatch("snapshot-A"),
      loadedCursorVersion: 0,
    });
    expect(second.ok).toBe(true);
    expect(
      await prisma.channelInventoryReconciliation.count({ where: { tenantId: TENANT } }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { tenantId: TENANT, eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE },
      }),
    ).toBe(1);
  });

  it("Finding C — already_committed returns actual stored committedCursorVersion", async () => {
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );
    const cursors = new PrismaChannelPollCursorRepository();
    await cursors.advanceCursor({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "committed-payload",
    });
    await cursors.advanceCursor({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 1,
      nextPayload: "committed-payload",
    });
    await setTenantContext(prisma, TENANT);
    const stored = await prisma.channelPollCursor.findUnique({
      where: {
        tenantId_connectionId: { tenantId: TENANT, connectionId: CONNECTION_ID },
      },
    });
    expect(stored?.version).toBe(2);

    const store = new PrismaChannelPollInventoryCommitStore(prisma, {}, undefined, () => true);
    const result = await store.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      proposedNextCursor: "committed-payload",
      inventorySnapshot: emptySnapshot(),
      batch: emptyBatch("committed-payload"),
      loadedCursorVersion: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pollResult.cursorReconciliation).toBe("already_committed");
    expect(result.pollResult.committedCursorVersion).toBe(stored!.version);
    expect(result.pollResult.committedCursorVersion).toBe(2);
    expect(result.pollResult.committedCursorVersion).not.toBe(1);
  });

  it("Finding D — >1 active mapping fails closed: no cursor/generation/outbox", async () => {
    await setTenantContext(prisma, TENANT);
    const now = new Date();
    await prisma.channelListingMapping.createMany({
      data: [
        {
          tenantId: TENANT,
          id: MAPPING_ID,
          connectionId: CONNECTION_ID,
          externalListingId: "ext-a",
          externalUnitId: null,
          propertyId: PROPERTY_ID,
          unitId: UNIT_ID,
          syncDirection: "inbound",
          status: "active",
          mappingVersion: 1,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          tenantId: TENANT,
          id: "s6a-inv-mapping-2",
          connectionId: CONNECTION_ID,
          externalListingId: "ext-b",
          externalUnitId: null,
          propertyId: PROPERTY_ID,
          unitId: "s6a-unit-2",
          syncDirection: "inbound",
          status: "active",
          mappingVersion: 1,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const store = new PrismaChannelPollInventoryCommitStore(prisma, {}, undefined, () => true);
    const result = await store.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      proposedNextCursor: "multi-map",
      inventorySnapshot: nonemptySnapshot(),
      batch: emptyBatch("multi-map"),
      loadedCursorVersion: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("mapping_count_invalid");
    expect(await prisma.channelPollCursor.count({ where: { tenantId: TENANT } })).toBe(0);
    expect(await prisma.channelInventoryReconciliation.count({ where: { tenantId: TENANT } })).toBe(
      0,
    );
    expect(
      await prisma.outboxEvent.count({
        where: { tenantId: TENANT, eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE },
      }),
    ).toBe(0);
  });

  it("Finding E — full 5,000-item legal max snapshot persists in real PostgreSQL", async () => {
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );

    const canonicalJson = buildWorstCaseActionableSnapshotJson(ICAL_INVENTORY_CAPACITY.maxItems);
    const utf8ByteLength = Buffer.byteLength(canonicalJson, "utf8");
    expect(utf8ByteLength).toBe(2_220_001);
    expect(utf8ByteLength).toBe(ICAL_INVENTORY_CAPACITY.worstCaseSnapshotUtf8Bytes);
    expect(utf8ByteLength).toBeLessThanOrEqual(ICAL_INVENTORY_CAPACITY.hardCapUtf8Bytes);

    const item = {
      sourceIdentityKey: "A".repeat(324),
      entryContentHash: "a".repeat(64),
      identityKind: "uid_only" as const,
      checkIn: "9999-12-31",
      checkOut: "9999-12-31",
    };
    const inventorySnapshot = {
      snapshotHash: "d".repeat(64),
      items: Array.from({ length: ICAL_INVENTORY_CAPACITY.maxItems }, () => item),
      canonicalJson,
      utf8ByteLength,
      completeObservedEvidence: true as const,
      // Capacity proof focuses on actionable payload; observed evidence stays minimal.
      observedSourceIdentityKeys: [item.sourceIdentityKey],
      cancelledSourceIdentityKeys: [] as string[],
    };

    const store = new PrismaChannelPollInventoryCommitStore(
      prisma,
      {},
      { timeout: 120_000 },
      () => true,
    );
    const result = await store.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      proposedNextCursor: "cursor-5k",
      inventorySnapshot,
      batch: emptyBatch("cursor-5k"),
      loadedCursorVersion: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pollResult.committedCursorVersion).toBe(1);

    await setTenantContext(prisma, TENANT);
    const cursor = await prisma.channelPollCursor.findUnique({
      where: {
        tenantId_connectionId: { tenantId: TENANT, connectionId: CONNECTION_ID },
      },
    });
    expect(cursor?.version).toBe(1);
    expect(cursor?.payload).toBe("cursor-5k");

    const gen = await prisma.channelInventoryReconciliation.findFirst({
      where: { tenantId: TENANT, connectionId: CONNECTION_ID },
    });
    expect(gen).not.toBeNull();
    expect(gen?.reconcileStatus).toBe("pending");
    const stored = gen!.actionableSnapshot;
    expect(Array.isArray(stored)).toBe(true);
    expect((stored as unknown[]).length).toBe(ICAL_INVENTORY_CAPACITY.maxItems);
    // JSONB may reorder object keys; assert semantic equality of the read-back snapshot.
    expect(stored).toEqual(JSON.parse(canonicalJson));
    const first = (stored as Array<Record<string, unknown>>)[0];
    expect(first?.i).toBe("A".repeat(324));
    expect(first?.h).toBe("a".repeat(64));
    expect(first?.k).toBe(1);
    expect(first?.s).toBe("9999-12-31");
    expect(first?.e).toBe("9999-12-31");

    expect(
      await prisma.outboxEvent.count({
        where: { tenantId: TENANT, eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE },
      }),
    ).toBe(1);
  }, 180_000);

  it("Finding F — over-cap rejection via orchestration leaves cursor unchanged; no gen/outbox", async () => {
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );
    const cursors = new PrismaChannelPollCursorRepository();
    await cursors.advanceCursor({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "pre-existing",
    });

    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      const connections = new PrismaChannelConnectionRepository();
      const commitStore = new PrismaChannelPollInventoryCommitStore(
        prisma,
        {},
        undefined,
        () => true,
      );
      const pollBatchUseCase = {
        execute: async () => ({
          ackAllowed: true as const,
          results: [] as [],
          proposedNextCursor: "over-cap-cursor",
          inventoryActionableSnapshot: null,
          inventoryProjectionFailureCode: "CAPACITY_EXCEEDED" as const,
        }),
      } as unknown as ReceiveChannelPollBatchUseCase;

      const result = await new ExecuteChannelPollConnectionUseCase(
        connections,
        cursors,
        pollBatchUseCase,
        commitStore,
      ).execute({ tenantId: TENANT, connectionId: CONNECTION_ID });

      expect(result.cursorAdvanced).toBe(false);
      expect(result.committedCursorVersion).toBeNull();
      expect(result.errorMessage).toBe("inventory_snapshot_capacity_exceeded");

      await setTenantContext(prisma, TENANT);
      const cursor = await prisma.channelPollCursor.findUnique({
        where: {
          tenantId_connectionId: { tenantId: TENANT, connectionId: CONNECTION_ID },
        },
      });
      expect(cursor?.version).toBe(1);
      expect(cursor?.payload).toBe("pre-existing");
      expect(
        await prisma.channelInventoryReconciliation.count({ where: { tenantId: TENANT } }),
      ).toBe(0);
      expect(
        await prisma.outboxEvent.count({
          where: { tenantId: TENANT, eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE },
        }),
      ).toBe(0);
    } finally {
      if (previous === undefined) {
        delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      } else {
        process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
      }
    }
  });

  it("CAS loser creates neither generation nor outbox", async () => {
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );
    await setTenantContext(prisma, TENANT);
    await prisma.channelPollCursor.create({
      data: {
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        payload: "already",
        version: 1,
        semanticConfigVersion: 1,
      },
    });

    const store = new PrismaChannelPollInventoryCommitStore(prisma, {}, undefined, () => true);
    const result = await store.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      proposedNextCursor: "loser",
      inventorySnapshot: nonemptySnapshot(),
      batch: emptyBatch("loser"),
      loadedCursorVersion: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("cursor_conflict");
    expect(await prisma.channelInventoryReconciliation.count({ where: { tenantId: TENANT } })).toBe(
      0,
    );
    expect(
      await prisma.outboxEvent.count({
        where: { tenantId: TENANT, eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE },
      }),
    ).toBe(0);
  });

  it("rollback after injected failure after cursor CAS leaves no generation/outbox/cursor win", async () => {
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );

    const store = new PrismaChannelPollInventoryCommitStore(
      prisma,
      {
        afterCursorCas: async () => {
          throw new Error("injected-failure");
        },
      },
      { timeout: 15_000 },
      () => true,
    );

    await expect(
      store.commit({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        provider: "ical",
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 0,
        proposedNextCursor: "rollback",
        inventorySnapshot: nonemptySnapshot(),
        batch: emptyBatch("rollback"),
        loadedCursorVersion: 0,
      }),
    ).rejects.toThrow(/injected-failure/);

    await setTenantContext(prisma, TENANT);
    expect(await prisma.channelPollCursor.count({ where: { tenantId: TENANT } })).toBe(0);
    expect(await prisma.channelInventoryReconciliation.count({ where: { tenantId: TENANT } })).toBe(
      0,
    );
    expect(
      await prisma.outboxEvent.count({
        where: { tenantId: TENANT, eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE },
      }),
    ).toBe(0);
  });

  it("mapping write store serializes behind connection lock vs TX1", async () => {
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );

    let releaseTx1!: () => void;
    const tx1Hold = new Promise<void>((resolve) => {
      releaseTx1 = resolve;
    });

    const store = new PrismaChannelPollInventoryCommitStore(
      prisma,
      {
        afterConnectionLock: async () => {
          await tx1Hold;
        },
      },
      { timeout: 20_000 },
      () => true,
    );

    const tx1Promise = store.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      proposedNextCursor: "concurrent",
      inventorySnapshot: emptySnapshot(),
      batch: emptyBatch("concurrent"),
      loadedCursorVersion: 0,
    });

    await new Promise((r) => setTimeout(r, 200));

    const mapping = await mappingRepo.findById(TENANT, MAPPING_ID);
    expect(mapping).not.toBeNull();
    mapping!.pause();

    const mappingPromise = mappingWriteStore.persist(mapping!);
    let mappingDone = false;
    void mappingPromise.then(() => {
      mappingDone = true;
    });

    await new Promise((r) => setTimeout(r, 300));
    expect(mappingDone).toBe(false);

    releaseTx1();
    const tx1 = await tx1Promise;
    expect(tx1.ok).toBe(true);
    await mappingPromise;
    expect(mappingDone).toBe(true);
  });

  it("tenant isolation: other tenant mapping/connection cannot satisfy TX1", async () => {
    await seedConnection(TENANT_B, CONNECTION_ID);
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT_B,
        connectionId: CONNECTION_ID,
        externalListingId: "ext-b",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        syncDirection: "inbound",
      }),
    );

    const store = new PrismaChannelPollInventoryCommitStore(prisma, {}, undefined, () => true);
    const result = await store.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      proposedNextCursor: "iso",
      inventorySnapshot: emptySnapshot(),
      batch: emptyBatch("iso"),
      loadedCursorVersion: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("mapping_count_invalid");
  });
});

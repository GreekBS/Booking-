/**
 * P1-S7c — PostgreSQL proofs for connection inventory-apply fence.
 *
 * Requires DATABASE_URL; otherwise skipped.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  ChannelListingMapping,
  DeactivateChannelConnectionInventoryUseCase,
  DisableChannelConnectionInventoryApplyUseCase,
  EnableChannelConnectionInventoryApplyUseCase,
  ExecuteChannelPollConnectionUseCase,
  InMemoryChannelPollJobQuery,
  PermissionChecker,
  type ReceiveChannelPollBatchUseCase,
} from "@hcp/domain";
import {
  PrismaChannelConnectionInventoryApplyStore,
  PrismaChannelConnectionRepository,
  PrismaChannelInventoryReconciliationApplyStore,
  PrismaChannelListingMappingRepository,
  PrismaChannelPollCursorRepository,
  PrismaChannelPollInventoryCommitStore,
  PrismaDeactivateChannelConnectionInventoryStore,
} from "../../src";
import { prisma, setTenantContext, truncateIntegrationTables } from "./helpers";
import { runIntegration } from "./integrationGate";


const TENANT = "550e8400-e29b-41d4-a716-446655440910";
const CONNECTION_ID = "s7c-fence-connection";
const MAPPING_ID = "s7c-fence-mapping";
const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440911";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440912";
const ACTOR = "550e8400-e29b-41d4-a716-446655440913";

const INTEGRATION_TX_OPTIONS = { maxWait: 20_000, timeout: 60_000 };

const actor = {
  userId: ACTOR,
  role: "admin" as const,
  propertyIds: null,
  isSuperAdmin: true,
};
const audit = { actorId: ACTOR, ipAddress: "127.0.0.1" };

function compactSnapshot() {
  return [{ i: "src-s7c", h: "c".repeat(64), k: 1 as const, s: "2026-09-10", e: "2026-09-13" }];
}

function nonemptySnapshot() {
  const item = {
    sourceIdentityKey: "src-s7c",
    entryContentHash: "c".repeat(64),
    identityKind: "uid_only" as const,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
  };
  const canonicalJson = JSON.stringify([
    { i: item.sourceIdentityKey, h: item.entryContentHash, k: 1, s: item.checkIn, e: item.checkOut },
  ]);
  return {
    snapshotHash: "d".repeat(64),
    items: [item],
    canonicalJson,
    utf8ByteLength: Buffer.byteLength(canonicalJson, "utf8"),
    completeObservedEvidence: true as const,
    observedSourceIdentityKeys: [item.sourceIdentityKey],
    cancelledSourceIdentityKeys: [] as string[],
  };
}

async function seedGraph(options?: { inventoryApplyEnabled?: boolean }) {
  await prisma.tenant.upsert({
    where: { id: TENANT },
    create: {
      id: TENANT,
      name: "S7c Fence",
      slug: "int-s7c-fence",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });
  await prisma.property.upsert({
    where: { id: PROPERTY_ID },
    create: {
      id: PROPERTY_ID,
      tenantId: TENANT,
      name: "S7c Fence Property",
      slug: "s7c-fence-prop",
      status: "active",
      timezone: "UTC",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });
  await prisma.unit.upsert({
    where: { id: UNIT_ID },
    create: {
      id: UNIT_ID,
      tenantId: TENANT,
      propertyId: PROPERTY_ID,
      name: "S7c Fence Unit",
      slug: "s7c-fence-unit",
      status: "active",
      maxGuests: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });

  await prisma.channelConnection.create({
    data: {
      tenantId: TENANT,
      id: CONNECTION_ID,
      provider: "ical",
      displayName: "S7c Fence",
      status: "active",
      credentialRef: "cred_s7c_fence",
      semanticMode: "availability_block_feed",
      semanticConfigVersion: 1,
      inventoryApplyEnabled: options?.inventoryApplyEnabled === true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await new PrismaChannelListingMappingRepository().save(
    ChannelListingMapping.createActive({
      id: MAPPING_ID,
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      externalListingId: "ext-s7c-fence",
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
      syncDirection: "inbound",
    }),
  );
}

async function seedPendingGeneration(cursorVersion = 1, snapshot = compactSnapshot()) {
  await setTenantContext(prisma, TENANT);
  await prisma.channelInventoryReconciliation.create({
    data: {
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion,
      semanticConfigVersion: 1,
      mappingId: MAPPING_ID,
      mappingVersion: 1,
      unitId: UNIT_ID,
      propertyId: PROPERTY_ID,
      snapshotHash: "d".repeat(64),
      actionableSnapshot: snapshot,
      reconcileStatus: "pending",
      createdAt: new Date(),
    },
  });
}

async function seedCursor(version: number, payload: string) {
  await setTenantContext(prisma, TENANT);
  await prisma.channelPollCursor.create({
    data: {
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      version,
      payload,
      semanticConfigVersion: 1,
      updatedAt: new Date(),
    },
  });
}

function buildEnableDisable() {
  const connections = new PrismaChannelConnectionRepository();
  const mappings = new PrismaChannelListingMappingRepository();
  const store = new PrismaChannelConnectionInventoryApplyStore();
  const pollQuery = new InMemoryChannelPollJobQuery(() => []);
  const healthQuery = {
    getReconciliationSummary: async () => ({ latest: null, pendingCount: 0 }),
    findLatestReconcileJob: async () => null,
    countActiveChannelImports: async () => 0,
  };
  const rotationStore = {
    findInProgressForConnection: async () => null,
  };

  return {
    connections,
    enable: new EnableChannelConnectionInventoryApplyUseCase(
      connections,
      mappings,
      pollQuery,
      healthQuery as never,
      rotationStore as never,
      store,
      new PermissionChecker(),
    ),
    disable: new DisableChannelConnectionInventoryApplyUseCase(
      connections,
      store,
      new PermissionChecker(),
    ),
  };
}

runIntegration("P1-S7c ChannelInventoryApplyFence (PostgreSQL)", () => {
  const previousApply = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
  const applyStore = new PrismaChannelInventoryReconciliationApplyStore(
    prisma,
    {},
    INTEGRATION_TX_OPTIONS,
    () => process.env.CHANNELS_INVENTORY_APPLY_ENABLED === "true",
  );

  beforeEach(async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    await truncateIntegrationTables();
    await prisma.user.create({
      data: {
        id: ACTOR,
        email: "s7c-fence@integration.test",
        name: "S7c Fence Actor",
      },
    });
    await seedGraph({ inventoryApplyEnabled: true });
  });

  afterAll(async () => {
    if (previousApply === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previousApply;
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("PG-A disable wins (TX2 DEFERS, zero writes)", async () => {
    await seedPendingGeneration(1);

    const holder = new PrismaClient();
    let releaseHold!: () => void;
    const hold = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });

    try {
      const disableHoldTx = holder.$transaction(
        async (tx) => {
          await setTenantContext(tx, TENANT);
          await tx.$queryRaw`
            SELECT "id"
            FROM "channel_connections"
            WHERE "tenant_id" = ${TENANT}::uuid AND "id" = ${CONNECTION_ID}
            FOR UPDATE
          `;
          await tx.$executeRaw`
            UPDATE "channel_connections"
            SET "inventory_apply_enabled" = false, "updated_at" = NOW()
            WHERE "tenant_id" = ${TENANT}::uuid AND "id" = ${CONNECTION_ID}
          `;
          locked();
          await hold;
        },
        INTEGRATION_TX_OPTIONS,
      );

      await ready;
      const tx2Promise = applyStore.apply({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        cursorVersion: 1,
      });

      await new Promise((r) => setTimeout(r, 300));
      releaseHold();
      await disableHoldTx;

      const result = await tx2Promise;
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.execution).toBe("DEFER");
      expect(result.deferReason).toBe("inventory_apply_disabled");
      expect(result.createdCount).toBe(0);

      await setTenantContext(prisma, TENANT);
      expect(
        await prisma.unitCalendarBlock.count({
          where: { tenantId: TENANT, blockType: "channel_import" },
        }),
      ).toBe(0);
      expect(
        (
          await prisma.channelInventoryReconciliation.findFirst({
            where: { tenantId: TENANT, connectionId: CONNECTION_ID, cursorVersion: 1 },
          })
        )?.reconcileStatus,
      ).toBe("pending");
    } finally {
      await holder.$disconnect();
    }
  }, 120_000);

  it("PG-B TX2 wins then disable (first write ok, later zero)", async () => {
    await seedPendingGeneration(1);

    let releaseTx2!: () => void;
    const tx2Hold = new Promise<void>((resolve) => {
      releaseTx2 = resolve;
    });
    let afterLock!: () => void;
    const locked = new Promise<void>((resolve) => {
      afterLock = resolve;
    });

    const racingApply = new PrismaChannelInventoryReconciliationApplyStore(
      prisma,
      {
        afterReconciliationLock: async () => {
          afterLock();
          await tx2Hold;
        },
      },
      INTEGRATION_TX_OPTIONS,
      () => true,
    );

    const tx2Promise = racingApply.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });

    await locked;

    const { disable } = buildEnableDisable();
    const disablePromise = disable.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
      },
      actor,
      audit,
    );

    await new Promise((r) => setTimeout(r, 300));
    releaseTx2();

    const first = await tx2Promise;
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.execution).toBe("APPLY");
    expect(first.createdCount).toBe(1);

    const disabled = await disablePromise;
    expect(disabled.isSuccess).toBe(true);

    await seedPendingGeneration(2, [
      { i: "src-later", h: "e".repeat(64), k: 1, s: "2026-10-01", e: "2026-10-03" },
    ]);
    const later = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 2,
    });
    expect(later.ok).toBe(true);
    if (!later.ok) return;
    expect(later.execution).toBe("DEFER");
    expect(later.createdCount).toBe(0);

    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.unitCalendarBlock.count({
        where: {
          tenantId: TENANT,
          blockType: "channel_import",
          sourceIdentityKey: "src-later",
        },
      }),
    ).toBe(0);
  }, 120_000);

  it("PG-C stale pending supersession on enable", async () => {
    await truncateIntegrationTables();
    await prisma.user.create({
      data: {
        id: ACTOR,
        email: "s7c-fence@integration.test",
        name: "S7c Fence Actor",
      },
    });
    await seedGraph({ inventoryApplyEnabled: false });
    await seedCursor(2, "committed-v2");
    await seedPendingGeneration(1);
    await seedPendingGeneration(2);

    const { enable } = buildEnableDisable();
    const result = await enable.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
      },
      actor,
      audit,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().supersededPendingCount).toBe(1);
    expect(result.getValue().inventoryApplyEnabled).toBe(true);

    await setTenantContext(prisma, TENANT);
    const gens = await prisma.channelInventoryReconciliation.findMany({
      where: { tenantId: TENANT, connectionId: CONNECTION_ID },
      orderBy: { cursorVersion: "asc" },
    });
    expect(gens).toHaveLength(2);
    expect(gens[0]?.reconcileStatus).toBe("superseded");
    expect(gens[1]?.reconcileStatus).toBe("pending");
  });

  it("PG-D enable vs waiting stale TX2 (enable holds lock → TX2 NOOP)", async () => {
    await truncateIntegrationTables();
    await prisma.user.create({
      data: {
        id: ACTOR,
        email: "s7c-fence@integration.test",
        name: "S7c Fence Actor",
      },
    });
    await seedGraph({ inventoryApplyEnabled: true });
    await seedCursor(2, "committed-v2");
    await seedPendingGeneration(1);

    const holder = new PrismaClient();
    let releaseHold!: () => void;
    const hold = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });

    try {
      const enableHoldTx = holder.$transaction(
        async (tx) => {
          await setTenantContext(tx, TENANT);
          // Mirror enable lock order: connection → mappings → cursor, then supersede.
          await tx.$queryRaw`
            SELECT "id"
            FROM "channel_connections"
            WHERE "tenant_id" = ${TENANT}::uuid AND "id" = ${CONNECTION_ID}
            FOR UPDATE
          `;
          await tx.$queryRaw`
            SELECT "id"
            FROM "channel_listing_mappings"
            WHERE "tenant_id" = ${TENANT}::uuid AND "connection_id" = ${CONNECTION_ID}
            FOR UPDATE
          `;
          await tx.$queryRaw`
            SELECT "version"
            FROM "channel_poll_cursors"
            WHERE "tenant_id" = ${TENANT}::uuid AND "connection_id" = ${CONNECTION_ID}
            FOR UPDATE
          `;
          await tx.$executeRaw`
            UPDATE "channel_inventory_reconciliations"
            SET "reconcile_status" = 'superseded'::"ChannelInventoryReconcileStatus"
            WHERE "tenant_id" = ${TENANT}::uuid
              AND "connection_id" = ${CONNECTION_ID}
              AND "reconcile_status" = 'pending'::"ChannelInventoryReconcileStatus"
              AND "cursor_version" < 2
          `;
          locked();
          await hold;
        },
        INTEGRATION_TX_OPTIONS,
      );

      await ready;
      const tx2Promise = applyStore.apply({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        cursorVersion: 1,
      });

      await new Promise((r) => setTimeout(r, 300));
      releaseHold();
      await enableHoldTx;

      const result = await tx2Promise;
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.execution).toBe("NOOP");
      expect(result.reconcileStatus).toBe("superseded");
      expect(result.createdCount).toBe(0);

      await setTenantContext(prisma, TENANT);
      expect(
        await prisma.unitCalendarBlock.count({
          where: { tenantId: TENANT, blockType: "channel_import" },
        }),
      ).toBe(0);
    } finally {
      await holder.$disconnect();
    }
  }, 120_000);

  it("PG-E current-cursor pending retained and applies", async () => {
    await truncateIntegrationTables();
    await prisma.user.create({
      data: {
        id: ACTOR,
        email: "s7c-fence@integration.test",
        name: "S7c Fence Actor",
      },
    });
    await seedGraph({ inventoryApplyEnabled: false });
    await seedCursor(2, "committed-v2");
    await seedPendingGeneration(1);
    await seedPendingGeneration(2);

    const { enable } = buildEnableDisable();
    const enabled = await enable.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
      },
      actor,
      audit,
    );
    expect(enabled.isSuccess).toBe(true);
    expect(enabled.getValue().supersededPendingCount).toBe(1);

    const applied = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 2,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.execution).toBe("APPLY");
    expect(applied.createdCount).toBe(1);

    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.unitCalendarBlock.count({
        where: {
          tenantId: TENANT,
          blockType: "channel_import",
          status: "active",
          sourceIdentityKey: "src-s7c",
        },
      }),
    ).toBe(1);
  });

  it("PG-F OFF→ON unchanged feed Finding B materializes", async () => {
    await truncateIntegrationTables();
    await prisma.user.create({
      data: {
        id: ACTOR,
        email: "s7c-fence@integration.test",
        name: "S7c Fence Actor",
      },
    });
    await seedGraph({ inventoryApplyEnabled: false });

    const connections = new PrismaChannelConnectionRepository();
    const cursors = new PrismaChannelPollCursorRepository();
    const snap = nonemptySnapshot();
    const pollBatchUseCase = {
      execute: async () => ({
        ackAllowed: true as const,
        results: [] as [],
        proposedNextCursor: "snapshot-A",
        inventoryActionableSnapshot: snap,
        inventoryProjectionFailureCode: null,
      }),
    } as unknown as ReceiveChannelPollBatchUseCase;

    const commitStore = new PrismaChannelPollInventoryCommitStore(
      prisma,
      {},
      INTEGRATION_TX_OPTIONS,
      () => true,
    );

    const off = await new ExecuteChannelPollConnectionUseCase(
      connections,
      cursors,
      pollBatchUseCase,
      commitStore,
    ).execute({ tenantId: TENANT, connectionId: CONNECTION_ID });
    expect(off.cursorAdvanced).toBe(true);
    expect(off.committedCursorVersion).toBe(1);
    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.channelInventoryReconciliation.count({ where: { tenantId: TENANT } }),
    ).toBe(0);

    const { enable } = buildEnableDisable();
    const enabled = await enable.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
      },
      actor,
      audit,
    );
    expect(enabled.isSuccess).toBe(true);

    const on = await new ExecuteChannelPollConnectionUseCase(
      connections,
      cursors,
      pollBatchUseCase,
      commitStore,
    ).execute({ tenantId: TENANT, connectionId: CONNECTION_ID });
    expect(on.cursorAdvanced).toBe(true);
    expect(on.committedCursorVersion).toBe(2);

    await setTenantContext(prisma, TENANT);
    const gens = await prisma.channelInventoryReconciliation.findMany({
      where: { tenantId: TENANT, connectionId: CONNECTION_ID },
    });
    expect(gens).toHaveLength(1);
    expect(gens[0]?.reconcileStatus).toBe("pending");
    expect(gens[0]?.cursorVersion).toBe(2);
  });

  it("Rollback: disable + inventory deactivate → zero active imports; later TX2 zero writes", async () => {
    await seedPendingGeneration(1);
    const first = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(first.ok && first.execution === "APPLY").toBe(true);

    const { disable, connections } = buildEnableDisable();
    const disabled = await disable.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
      },
      actor,
      audit,
    );
    expect(disabled.isSuccess).toBe(true);

    const deactivate = new DeactivateChannelConnectionInventoryUseCase(
      connections,
      new PrismaDeactivateChannelConnectionInventoryStore(),
      new PermissionChecker(),
    );
    const deactivated = await deactivate.execute(
      { tenantId: TENANT, connectionId: CONNECTION_ID },
      actor,
      audit,
    );
    expect(deactivated.isSuccess).toBe(true);
    expect(deactivated.getValue().releasedCount).toBeGreaterThanOrEqual(1);

    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.unitCalendarBlock.count({
        where: {
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          blockType: "channel_import",
          status: "active",
        },
      }),
    ).toBe(0);

    await seedPendingGeneration(3, [
      { i: "src-after-rb", h: "f".repeat(64), k: 1, s: "2026-11-01", e: "2026-11-03" },
    ]);
    const later = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 3,
    });
    expect(later.ok).toBe(true);
    if (!later.ok) return;
    expect(later.execution).toBe("DEFER");
    expect(
      await prisma.unitCalendarBlock.count({
        where: {
          tenantId: TENANT,
          blockType: "channel_import",
          sourceIdentityKey: "src-after-rb",
        },
      }),
    ).toBe(0);
  }, 120_000);
});

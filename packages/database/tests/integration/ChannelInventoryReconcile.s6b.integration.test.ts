import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ChannelListingMapping,
  RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
  AvailabilityEvaluator,
  ForceRedrivePendingIcalInventoryReconcileUseCase,
  PermissionChecker,
  GuestCount,
  LocalDate,
  StayPeriod,
  buildIcalInventoryReconcilePrimaryJobKey,
  buildIcalInventoryReconcileSuccessorJobKey,
  isIcalInventoryReconcileJobKey,
  projectDesiredChannelImportBlocks,
} from "@hcp/domain";
import {
  PrismaChannelInventoryReconciliationApplyStore,
  PrismaChannelListingMappingRepository,
  PrismaIcalInventoryReconcileJobQuery,
  PrismaPendingIcalInventoryReconciliationReader,
  PrismaCalendarBlockRepository,
  PrismaChannelConnectionStatusFinder,
} from "../../src";
import { EnqueueJobUseCase } from "@hcp/domain";
import { PrismaBackgroundJobRepository, PrismaJobScheduler } from "../../src";
import { SweepPendingIcalInventoryReconcileUseCase } from "@hcp/domain";
import { prisma, setTenantContext } from "./helpers";
import { runIntegration } from "./integrationGate";


const TENANT = "550e8400-e29b-41d4-a716-446655440710";
const CONNECTION_ID = "s6b-inv-connection";
const MAPPING_ID = "s6b-inv-mapping";
const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440711";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440712";

function compactSnapshot() {
  const item = {
    i: "src-a",
    h: "c".repeat(64),
    k: 1 as const,
    s: "2026-09-10",
    e: "2026-09-13",
  };
  return [item];
}

async function seedTenantGraph() {
  await prisma.tenant.upsert({
    where: { id: TENANT },
    create: {
      id: TENANT,
      name: "S6b Tenant",
      slug: "int-s6b-tenant",
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
      name: "S6b Property",
      slug: "s6b-prop",
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
      name: "S6b Unit",
      slug: "s6b-unit",
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
      displayName: "S6b",
      status: "active",
      semanticMode: "availability_block_feed",
      semanticConfigVersion: 1,
      inventoryApplyEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

runIntegration("P1-S6b Prisma inventory apply / redrive", () => {
  const mappingRepo = new PrismaChannelListingMappingRepository();
  const applyStore = new PrismaChannelInventoryReconciliationApplyStore(
    prisma,
    {},
    { timeout: 30_000 },
    () => true,
  );

  beforeEach(async () => {
    await prisma.backgroundJob.deleteMany({
      where: { tenantId: TENANT },
    });
    await prisma.outboxEvent.deleteMany({ where: { tenantId: TENANT } });
    await prisma.channelInventoryReconciliation.deleteMany({
      where: { tenantId: TENANT },
    });
    await prisma.unitCalendarBlock.deleteMany({ where: { tenantId: TENANT } });
    await prisma.channelListingMapping.deleteMany({ where: { tenantId: TENANT } });
    await prisma.channelPollCursor.deleteMany({ where: { tenantId: TENANT } });
    await prisma.channelConnection.deleteMany({ where: { tenantId: TENANT } });
    await prisma.unit.deleteMany({ where: { tenantId: TENANT } });
    await prisma.property.deleteMany({ where: { tenantId: TENANT } });
    await seedTenantGraph();
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
  });

  afterAll(async () => {
    await prisma.backgroundJob.deleteMany({ where: { tenantId: TENANT } });
    await prisma.channelInventoryReconciliation.deleteMany({ where: { tenantId: TENANT } });
    await prisma.unitCalendarBlock.deleteMany({ where: { tenantId: TENANT } });
    await prisma.channelListingMapping.deleteMany({ where: { tenantId: TENANT } });
    await prisma.channelConnection.deleteMany({ where: { tenantId: TENANT } });
    await prisma.unit.deleteMany({ where: { tenantId: TENANT } });
    await prisma.property.deleteMany({ where: { tenantId: TENANT } });
    await prisma.$disconnect();
  });

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

  it("TX2 apply upserts channel_import and marks applied; retains stale without observed evidence", async () => {
    await seedPendingGeneration(1);
    // Pre-existing stale identity D
    await setTenantContext(prisma, TENANT);
    await prisma.$executeRaw`
      INSERT INTO "unit_calendar_blocks" (
        "id","tenant_id","unit_id","property_id","block_type","source_id",
        "check_in","check_out","status",
        "connection_id","semantic_config_version","mapping_id",
        "source_identity_key","entry_content_hash","identity_kind",
        "created_at","updated_at"
      ) VALUES (
        gen_random_uuid(), ${TENANT}::uuid, ${UNIT_ID}::uuid, ${PROPERTY_ID}::uuid,
        'channel_import'::"CalendarBlockType", NULL,
        '2026-01-01'::date, '2026-01-02'::date, 'active'::"CalendarBlockStatus",
        ${CONNECTION_ID}, 1, ${MAPPING_ID},
        'src-d', ${"e".repeat(64)}, 'uid_only',
        NOW(), NOW()
      )
    `;

    const result = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.execution).toBe("APPLY");
    expect(result.reconcileStatus).toBe("applied");
    expect(result.createdCount).toBe(1);
    expect(result.retainedStaleCount).toBe(1);
    expect(result.deactivatedCount).toBe(0);

    await setTenantContext(prisma, TENANT);
    const blocks = await prisma.unitCalendarBlock.findMany({
      where: { tenantId: TENANT, blockType: "channel_import", status: "active" },
    });
    expect(blocks).toHaveLength(2);
    const a = blocks.find((b) => b.sourceIdentityKey === "src-a");
    expect(a?.checkIn.toISOString().startsWith("2026-09-10")).toBe(true);
    expect(a?.checkOut.toISOString().startsWith("2026-09-13")).toBe(true);
    expect(blocks.some((b) => b.sourceIdentityKey === "src-d")).toBe(true);
  });

  it("same identity date change updates in place", async () => {
    await seedPendingGeneration(1);
    await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });

    await setTenantContext(prisma, TENANT);
    await prisma.channelInventoryReconciliation.create({
      data: {
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        cursorVersion: 2,
        semanticConfigVersion: 1,
        mappingId: MAPPING_ID,
        mappingVersion: 1,
        unitId: UNIT_ID,
        propertyId: PROPERTY_ID,
        snapshotHash: "f".repeat(64),
        actionableSnapshot: [
          { i: "src-a", h: "c".repeat(64), k: 1, s: "2026-09-11", e: "2026-09-14" },
        ],
        reconcileStatus: "pending",
        createdAt: new Date(),
      },
    });

    const second = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 2,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.updatedCount).toBeGreaterThanOrEqual(1);

    const blocks = await prisma.unitCalendarBlock.findMany({
      where: {
        tenantId: TENANT,
        blockType: "channel_import",
        sourceIdentityKey: "src-a",
        status: "active",
      },
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.checkIn.toISOString().startsWith("2026-09-11")).toBe(true);
  });

  it("flag OFF defers without mutating", async () => {
    await seedPendingGeneration(1);
    const deferred = new PrismaChannelInventoryReconciliationApplyStore(
      prisma,
      {},
      undefined,
      () => false,
    );
    const result = await deferred.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.execution).toBe("DEFER");
    await setTenantContext(prisma, TENANT);
    expect(
      (
        await prisma.channelInventoryReconciliation.findUnique({
          where: {
            tenantId_connectionId_cursorVersion: {
              tenantId: TENANT,
              connectionId: CONNECTION_ID,
              cursorVersion: 1,
            },
          },
        })
      )?.reconcileStatus,
    ).toBe("pending");
    expect(await prisma.unitCalendarBlock.count({ where: { tenantId: TENANT } })).toBe(0);
  });

  it("newer pending supersedes older without writes", async () => {
    await seedPendingGeneration(1);
    await seedPendingGeneration(2);
    const result = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.execution).toBe("SUPERSEDE");
    expect(await prisma.unitCalendarBlock.count({ where: { tenantId: TENANT } })).toBe(0);
  });

  it("sweep: no-job pending enqueues primary; completed deferred enqueues successor; dead_letter does not", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      await seedPendingGeneration(1);
      const jobs = new PrismaBackgroundJobRepository();
      const enqueue = new EnqueueJobUseCase(new PrismaJobScheduler(jobs));
      const sweep = new SweepPendingIcalInventoryReconcileUseCase(
        new PrismaPendingIcalInventoryReconciliationReader(),
        new PrismaIcalInventoryReconcileJobQuery(),
        enqueue,
        new PrismaChannelConnectionStatusFinder(),
      );

      const first = await sweep.execute();
      expect(first.isSuccess).toBe(true);
      expect(first.getValue().enqueuedPrimary).toBe(1);

      const listed = await jobs.claimBatch(10, {
        jobTypes: [RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE],
      });
      expect(listed).toHaveLength(1);
      expect(isIcalInventoryReconcileJobKey(listed[0]!.idempotencyKey!)).toBe(true);
      await jobs.markCompleted(listed[0]!.id);

      const second = await sweep.execute();
      expect(second.getValue().enqueuedSuccessor).toBe(1);
      const successorKey = buildIcalInventoryReconcileSuccessorJobKey(
        { tenantId: TENANT, connectionId: CONNECTION_ID, cursorVersion: 1 },
        listed[0]!.id,
      );
      const succ = await prisma.backgroundJob.findFirst({
        where: { tenantId: TENANT, idempotencyKey: successorKey },
      });
      expect(succ).not.toBeNull();

      // Mark successor dead_letter path: complete then force status
      await prisma.backgroundJob.update({
        where: { id: succ!.id },
        data: { status: "dead_letter", attemptCount: 5 },
      });
      // Also need pending gen still
      const third = await sweep.execute();
      expect(third.getValue().enqueuedSuccessor).toBe(0);
      expect(third.getValue().stuckDeadLetter).toBeGreaterThanOrEqual(1);
    } finally {
      if (previous === undefined) {
        delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      } else {
        process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
      }
    }
  });

  it("concurrent sweeps create exactly one successor (PostgreSQL)", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      await seedPendingGeneration(1);
      const jobs = new PrismaBackgroundJobRepository();
      const enqueue = new EnqueueJobUseCase(new PrismaJobScheduler(jobs));
      const primaryKey = buildIcalInventoryReconcilePrimaryJobKey({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        cursorVersion: 1,
      });
      const primary = await enqueue.execute({
        tenantId: TENANT,
        jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
        idempotencyKey: primaryKey,
        payload: {
          connectionId: CONNECTION_ID,
          cursorVersion: 1,
          semanticConfigVersion: 1,
          mappingId: MAPPING_ID,
          mappingVersion: 1,
        },
      });
      expect(primary.isSuccess).toBe(true);
      await jobs.markCompleted(primary.getValue().id);

      const sweepA = new SweepPendingIcalInventoryReconcileUseCase(
        new PrismaPendingIcalInventoryReconciliationReader(),
        new PrismaIcalInventoryReconcileJobQuery(),
        enqueue,
        new PrismaChannelConnectionStatusFinder(),
      );
      const sweepB = new SweepPendingIcalInventoryReconcileUseCase(
        new PrismaPendingIcalInventoryReconciliationReader(),
        new PrismaIcalInventoryReconcileJobQuery(),
        enqueue,
        new PrismaChannelConnectionStatusFinder(),
      );

      const [a, b] = await Promise.all([sweepA.execute(), sweepB.execute()]);
      expect(a.isSuccess && b.isSuccess).toBe(true);

      const successorKey = buildIcalInventoryReconcileSuccessorJobKey(
        { tenantId: TENANT, connectionId: CONNECTION_ID, cursorVersion: 1 },
        primary.getValue().id,
      );
      const count = await prisma.backgroundJob.count({
        where: {
          tenantId: TENANT,
          jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
          idempotencyKey: successorKey,
        },
      });
      expect(count).toBe(1);
    } finally {
      if (previous === undefined) {
        delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      } else {
        process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
      }
    }
  });

  it("accepts 324-char identity and rejects longer via CHECK", async () => {
    const okKey = "A".repeat(324);
    const projected = projectDesiredChannelImportBlocks([
      { i: okKey, h: "a".repeat(64), k: 1, s: "2026-01-01", e: "2026-01-02" },
    ]);
    expect(projected.ok).toBe(true);

    await seedPendingGeneration(1, [
      { i: okKey, h: "a".repeat(64), k: 1, s: "2026-01-01", e: "2026-01-02" },
    ]);
    const result = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(true);

    await expect(
      prisma.$executeRaw`
        INSERT INTO "unit_calendar_blocks" (
          "id","tenant_id","unit_id","property_id","block_type","source_id",
          "check_in","check_out","status",
          "connection_id","semantic_config_version","mapping_id",
          "source_identity_key","entry_content_hash","identity_kind",
          "created_at","updated_at"
        ) VALUES (
          gen_random_uuid(), ${TENANT}::uuid, ${UNIT_ID}::uuid, ${PROPERTY_ID}::uuid,
          'channel_import'::"CalendarBlockType", NULL,
          '2026-02-01'::date, '2026-02-02'::date, 'active'::"CalendarBlockStatus",
          ${CONNECTION_ID}, 1, ${MAPPING_ID},
          ${"B".repeat(325)}, ${"a".repeat(64)}, 'uid_only',
          NOW(), NOW()
        )
      `,
    ).rejects.toThrow();
  });

  it("connection missing permanently fails (generation cascades with connection)", async () => {
    await seedPendingGeneration(1);
    await prisma.channelConnection.deleteMany({ where: { tenantId: TENANT } });
    const result = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.execution).toBe("PERMANENT_FAIL");
    expect(result.code).toBe("connection_not_found");
    expect(result.reconcileStatus).toBe("failed");
    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.channelInventoryReconciliation.findUnique({
        where: {
          tenantId_connectionId_cursorVersion: {
            tenantId: TENANT,
            connectionId: CONNECTION_ID,
            cursorVersion: 1,
          },
        },
      }),
    ).toBeNull();

    const missingId = await applyStore.apply({
      tenantId: TENANT,
      connectionId: "no-such-connection",
      cursorVersion: 1,
    });
    expect(missingId.ok).toBe(false);
    if (missingId.ok) return;
    expect(missingId.code).toBe("connection_not_found");
    expect(missingId.reconcileStatus).toBe("failed");
  });

  it("semanticConfigVersion / mappingVersion / unit / property fences", async () => {
    await seedPendingGeneration(1);
    await setTenantContext(prisma, TENANT);
    await prisma.channelConnection.update({
      where: { tenantId_id: { tenantId: TENANT, id: CONNECTION_ID } },
      data: { semanticConfigVersion: 9 },
    });
    const staleEpoch = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(staleEpoch.ok && staleEpoch.execution).toBe("SUPERSEDE");

    await prisma.channelConnection.update({
      where: { tenantId_id: { tenantId: TENANT, id: CONNECTION_ID } },
      data: { semanticConfigVersion: 1 },
    });
    await prisma.channelInventoryReconciliation.update({
      where: {
        tenantId_connectionId_cursorVersion: {
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          cursorVersion: 1,
        },
      },
      data: { reconcileStatus: "pending", mappingVersion: 99 },
    });
    const mapVer = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(mapVer.ok && mapVer.execution).toBe("SUPERSEDE");

    await prisma.channelInventoryReconciliation.update({
      where: {
        tenantId_connectionId_cursorVersion: {
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          cursorVersion: 1,
        },
      },
      data: { reconcileStatus: "pending", mappingVersion: 1, unitId: "550e8400-e29b-41d4-a716-446655440799" },
    });
    // Need a second unit for FK? unit_id on recon is just stored string/uuid without FK maybe
    const unitMismatch = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(unitMismatch.ok).toBe(false);
    if (!unitMismatch.ok) expect(unitMismatch.code).toBe("unit_id_mismatch");
  });

  it("idempotent re-apply is NOOP; inactive historical identity may coexist", async () => {
    await seedPendingGeneration(1);
    await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    const again = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(again.ok && again.execution).toBe("NOOP");

    await setTenantContext(prisma, TENANT);
    await prisma.$executeRaw`
      INSERT INTO "unit_calendar_blocks" (
        "id","tenant_id","unit_id","property_id","block_type","source_id",
        "check_in","check_out","status",
        "connection_id","semantic_config_version","mapping_id",
        "source_identity_key","entry_content_hash","identity_kind",
        "created_at","updated_at"
      ) VALUES (
        gen_random_uuid(), ${TENANT}::uuid, ${UNIT_ID}::uuid, ${PROPERTY_ID}::uuid,
        'channel_import'::"CalendarBlockType", NULL,
        '2025-01-01'::date, '2025-01-02'::date, 'released'::"CalendarBlockStatus",
        ${CONNECTION_ID}, 1, ${MAPPING_ID},
        'src-a', ${"a".repeat(64)}, 'uid_only',
        NOW(), NOW()
      )
    `;
    const active = await prisma.unitCalendarBlock.count({
      where: {
        tenantId: TENANT,
        sourceIdentityKey: "src-a",
        status: "active",
        blockType: "channel_import",
      },
    });
    const released = await prisma.unitCalendarBlock.count({
      where: {
        tenantId: TENANT,
        sourceIdentityKey: "src-a",
        status: "released",
        blockType: "channel_import",
      },
    });
    expect(active).toBe(1);
    expect(released).toBe(1);
  });

  it("partial unique prevents duplicate active channel_import identity", async () => {
    await seedPendingGeneration(1);
    await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    await expect(
      prisma.$executeRaw`
        INSERT INTO "unit_calendar_blocks" (
          "id","tenant_id","unit_id","property_id","block_type","source_id",
          "check_in","check_out","status",
          "connection_id","semantic_config_version","mapping_id",
          "source_identity_key","entry_content_hash","identity_kind",
          "created_at","updated_at"
        ) VALUES (
          gen_random_uuid(), ${TENANT}::uuid, ${UNIT_ID}::uuid, ${PROPERTY_ID}::uuid,
          'channel_import'::"CalendarBlockType", NULL,
          '2026-03-01'::date, '2026-03-02'::date, 'active'::"CalendarBlockStatus",
          ${CONNECTION_ID}, 1, ${MAPPING_ID},
          'src-a', ${"a".repeat(64)}, 'uid_only',
          NOW(), NOW()
        )
      `,
    ).rejects.toThrow();
  });

  it("rollback after first block write leaves pending + no blocks", async () => {
    await seedPendingGeneration(1);
    const rolling = new PrismaChannelInventoryReconciliationApplyStore(
      prisma,
      {
        afterFirstBlockWrite: async () => {
          throw new Error("injected_failure");
        },
      },
      { timeout: 30_000 },
      () => true,
    );
    await expect(
      rolling.apply({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        cursorVersion: 1,
      }),
    ).rejects.toThrow(/injected_failure/);
    await setTenantContext(prisma, TENANT);
    expect(
      (
        await prisma.channelInventoryReconciliation.findUnique({
          where: {
            tenantId_connectionId_cursorVersion: {
              tenantId: TENANT,
              connectionId: CONNECTION_ID,
              cursorVersion: 1,
            },
          },
        })
      )?.reconcileStatus,
    ).toBe("pending");
    expect(await prisma.unitCalendarBlock.count({ where: { tenantId: TENANT } })).toBe(0);
  });

  it("concurrent same-generation TX2 workers converge to one applied + one active identity", async () => {
    await seedPendingGeneration(1);
    const a = new PrismaChannelInventoryReconciliationApplyStore(
      prisma,
      {},
      { timeout: 30_000 },
      () => true,
    );
    const b = new PrismaChannelInventoryReconciliationApplyStore(
      prisma,
      {},
      { timeout: 30_000 },
      () => true,
    );
    const [r1, r2] = await Promise.all([
      a.apply({ tenantId: TENANT, connectionId: CONNECTION_ID, cursorVersion: 1 }),
      b.apply({ tenantId: TENANT, connectionId: CONNECTION_ID, cursorVersion: 1 }),
    ]);
    expect(r1.ok && r2.ok).toBe(true);
    const executions = [r1, r2].map((r) => (r.ok ? r.execution : r.execution)).sort();
    expect(executions).toEqual(["APPLY", "NOOP"]);
    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.unitCalendarBlock.count({
        where: {
          tenantId: TENANT,
          blockType: "channel_import",
          sourceIdentityKey: "src-a",
          status: "active",
        },
      }),
    ).toBe(1);
  });

  it("channel_import may overlap booking/hold; blocks availability via active blocks", async () => {
    await seedPendingGeneration(1);
    await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    await setTenantContext(prisma, TENANT);
    await prisma.$executeRaw`
      INSERT INTO "unit_calendar_blocks" (
        "id","tenant_id","unit_id","property_id","block_type","source_id",
        "check_in","check_out","status","created_at","updated_at"
      ) VALUES
      (
        gen_random_uuid(), ${TENANT}::uuid, ${UNIT_ID}::uuid, ${PROPERTY_ID}::uuid,
        'booking'::"CalendarBlockType", ${"550e8400-e29b-41d4-a716-446655440801"}::uuid,
        '2026-09-10'::date, '2026-09-13'::date, 'active'::"CalendarBlockStatus",
        NOW(), NOW()
      ),
      (
        gen_random_uuid(), ${TENANT}::uuid, ${UNIT_ID}::uuid, ${PROPERTY_ID}::uuid,
        'hold'::"CalendarBlockType", ${"550e8400-e29b-41d4-a716-446655440802"}::uuid,
        '2026-10-10'::date, '2026-10-13'::date, 'active'::"CalendarBlockStatus",
        NOW(), NOW()
      )
    `;
    const blocks = await prisma.unitCalendarBlock.findMany({
      where: { tenantId: TENANT, status: "active" },
    });
    expect(blocks.filter((b) => b.blockType === "channel_import")).toHaveLength(1);
    expect(blocks.filter((b) => b.blockType === "booking")).toHaveLength(1);
    expect(blocks.filter((b) => b.blockType === "hold")).toHaveLength(1);

    const calendar = new PrismaCalendarBlockRepository();
    const active = await calendar.findActiveBlocks(UNIT_ID, TENANT);
    const evalResult = new AvailabilityEvaluator().evaluate({
      stayPeriod: StayPeriod.create("2026-09-10", "2026-09-12"),
      guestCount: GuestCount.create(2),
      unitMaxGuests: 4,
      rules: {
        minNights: 1,
        maxNights: 30,
        checkInDays: [0, 1, 2, 3, 4, 5, 6],
        checkOutDays: [0, 1, 2, 3, 4, 5, 6],
        advanceMinDays: 0,
        advanceMaxDays: 365,
        turnoverNights: 0,
      },
      activeBlocks: active,
      propertyLocalToday: LocalDate.create("2026-09-01"),
    });
    expect(evalResult.available).toBe(false);
  });

  it("tenant isolation: tenant B cannot apply tenant A generation", async () => {
    const TENANT_B = "550e8400-e29b-41d4-a716-446655440720";
    await prisma.tenant.upsert({
      where: { id: TENANT_B },
      create: {
        id: TENANT_B,
        name: "S6b B",
        slug: "int-s6b-tenant-b",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {},
    });
    await seedPendingGeneration(1);
    const result = await applyStore.apply({
      tenantId: TENANT_B,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(false);
    await setTenantContext(prisma, TENANT);
    expect(
      (
        await prisma.channelInventoryReconciliation.findUnique({
          where: {
            tenantId_connectionId_cursorVersion: {
              tenantId: TENANT,
              connectionId: CONNECTION_ID,
              cursorVersion: 1,
            },
          },
        })
      )?.reconcileStatus,
    ).toBe("pending");
  });

  it("sweep cancelled does not enqueue; force redrive enqueues successor", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      await seedPendingGeneration(1);
      const jobs = new PrismaBackgroundJobRepository();
      const enqueue = new EnqueueJobUseCase(new PrismaJobScheduler(jobs));
      const primary = await enqueue.execute({
        tenantId: TENANT,
        jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
        idempotencyKey: buildIcalInventoryReconcilePrimaryJobKey({
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          cursorVersion: 1,
        }),
        payload: {
          connectionId: CONNECTION_ID,
          cursorVersion: 1,
          semanticConfigVersion: 1,
          mappingId: MAPPING_ID,
          mappingVersion: 1,
        },
      });
      await jobs.cancel(primary.getValue().id);

      const sweep = new SweepPendingIcalInventoryReconcileUseCase(
        new PrismaPendingIcalInventoryReconciliationReader(),
        new PrismaIcalInventoryReconcileJobQuery(),
        enqueue,
        new PrismaChannelConnectionStatusFinder(),
      );
      const swept = await sweep.execute();
      expect(swept.getValue().stuckCancelled).toBeGreaterThanOrEqual(1);
      expect(swept.getValue().enqueuedSuccessor).toBe(0);

      const reader = new PrismaPendingIcalInventoryReconciliationReader();
      const force = new ForceRedrivePendingIcalInventoryReconcileUseCase(
        new PrismaIcalInventoryReconcileJobQuery(),
        enqueue,
        (tenantId, connectionId, cursorVersion) =>
          reader.findPending(tenantId, connectionId, cursorVersion),
        new PrismaChannelConnectionStatusFinder(),
        new PermissionChecker(),
        { append: async () => {} },
      );
      const redriven = await force.execute(
        {
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          cursorVersion: 1,
        },
        {
          userId: "operator",
          role: "admin",
          propertyIds: null,
          isSuperAdmin: true,
        },
        { actorId: "operator", ipAddress: null },
      );
      expect(redriven.isSuccess).toBe(true);
      expect(isIcalInventoryReconcileJobKey(redriven.getValue().idempotencyKey)).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      } else {
        process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
      }
    }
  });

  it("three consecutive DEFER/sweep/redrive cycles keep maxAttempts intact", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      await seedPendingGeneration(1);
      const jobs = new PrismaBackgroundJobRepository();
      const enqueue = new EnqueueJobUseCase(new PrismaJobScheduler(jobs));
      const deferredApply = new PrismaChannelInventoryReconciliationApplyStore(
        prisma,
        {},
        undefined,
        () => false,
      );
      const sweep = new SweepPendingIcalInventoryReconcileUseCase(
        new PrismaPendingIcalInventoryReconciliationReader(),
        new PrismaIcalInventoryReconcileJobQuery(),
        enqueue,
        new PrismaChannelConnectionStatusFinder(),
      );

      for (let i = 0; i < 3; i += 1) {
        await sweep.execute();
        const claimed = await jobs.claimBatch(10, {
          jobTypes: [RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE],
        });
        expect(claimed.length).toBeGreaterThanOrEqual(1);
        const job = claimed[claimed.length - 1]!;
        expect(job.maxAttempts).toBe(5);
        expect(job.attemptCount).toBeLessThanOrEqual(1);
        await deferredApply.apply({
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          cursorVersion: 1,
        });
        await jobs.markCompleted(job.id);
      }
      await setTenantContext(prisma, TENANT);
      expect(
        (
          await prisma.channelInventoryReconciliation.findUnique({
            where: {
              tenantId_connectionId_cursorVersion: {
                tenantId: TENANT,
                connectionId: CONNECTION_ID,
                cursorVersion: 1,
              },
            },
          })
        )?.reconcileStatus,
      ).toBe("pending");
    } finally {
      if (previous === undefined) {
        delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      } else {
        process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
      }
    }
  });

  it("race-safe enqueue converges on P2002 for same idempotency key", async () => {
    const jobs = new PrismaBackgroundJobRepository();
    const key = buildIcalInventoryReconcilePrimaryJobKey({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 42,
    });
    const payload = {
      connectionId: CONNECTION_ID,
      cursorVersion: 42,
    };
    const [a, b] = await Promise.all([
      jobs.enqueue({
        tenantId: TENANT,
        jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
        idempotencyKey: key,
        payload,
      }),
      jobs.enqueue({
        tenantId: TENANT,
        jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
        idempotencyKey: key,
        payload,
      }),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      await prisma.backgroundJob.count({
        where: {
          tenantId: TENANT,
          jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
          idempotencyKey: key,
        },
      }),
    ).toBe(1);
  });
});

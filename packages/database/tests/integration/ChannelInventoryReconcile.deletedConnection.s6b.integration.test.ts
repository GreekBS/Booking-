/**
 * P1-S6b — deleted-connection / CASCADE reconciliation closure proof.
 * Real PostgreSQL only.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ChannelListingMapping,
  RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
  ReconcileIcalImportedInventoryJobHandler,
  ReconcileIcalImportedInventoryUseCase,
  buildIcalInventoryReconcilePrimaryJobKey,
} from "@hcp/domain";
import {
  PrismaBackgroundJobRepository,
  PrismaChannelInventoryReconciliationApplyStore,
  PrismaChannelListingMappingRepository,
  PrismaJobScheduler,
} from "../../src";
import { EnqueueJobUseCase } from "@hcp/domain";
import { prisma, setTenantContext } from "./helpers";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const TENANT = "550e8400-e29b-41d4-a716-446655440730";
const TENANT_B = "550e8400-e29b-41d4-a716-446655440731";
const CONNECTION_ID = "s6b-del-conn";
const MAPPING_ID = "s6b-del-map";
const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440732";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440733";

async function seedGraph(tenantId = TENANT) {
  await prisma.tenant.upsert({
    where: { id: tenantId },
    create: {
      id: tenantId,
      name: `S6b Del ${tenantId.slice(-4)}`,
      slug: `int-s6b-del-${tenantId.slice(-4)}`,
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
      tenantId,
      name: "S6b Del Prop",
      slug: `s6b-del-prop-${tenantId.slice(-4)}`,
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
      tenantId,
      propertyId: PROPERTY_ID,
      name: "S6b Del Unit",
      slug: `s6b-del-unit-${tenantId.slice(-4)}`,
      status: "active",
      maxGuests: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });
  await prisma.channelConnection.create({
    data: {
      tenantId,
      id: CONNECTION_ID,
      provider: "ical",
      displayName: "S6b del",
      status: "active",
      semanticMode: "availability_block_feed",
      semanticConfigVersion: 1,
      inventoryApplyEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  await new PrismaChannelListingMappingRepository().save(
    ChannelListingMapping.createActive({
      id: MAPPING_ID,
      tenantId,
      connectionId: CONNECTION_ID,
      externalListingId: "ext-del",
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
      syncDirection: "inbound",
    }),
  );
}

async function seedPendingGeneration(tenantId = TENANT, cursorVersion = 1) {
  await setTenantContext(prisma, tenantId);
  await prisma.channelInventoryReconciliation.create({
    data: {
      tenantId,
      connectionId: CONNECTION_ID,
      cursorVersion,
      semanticConfigVersion: 1,
      mappingId: MAPPING_ID,
      mappingVersion: 1,
      unitId: UNIT_ID,
      propertyId: PROPERTY_ID,
      snapshotHash: "a".repeat(64),
      actionableSnapshot: [
        { i: "src-del", h: "b".repeat(64), k: 1, s: "2026-09-10", e: "2026-09-13" },
      ],
      reconcileStatus: "pending",
      createdAt: new Date(),
    },
  });
}

runIntegration("P1-S6b deleted-connection CASCADE semantics", () => {
  const applyStore = new PrismaChannelInventoryReconciliationApplyStore(
    prisma,
    {},
    { timeout: 30_000 },
    () => true,
  );

  beforeEach(async () => {
    await prisma.backgroundJob.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.outboxEvent.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await setTenantContext(prisma, TENANT);
    await prisma.channelInventoryReconciliation.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.unitCalendarBlock.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.channelListingMapping.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.channelPollCursor.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.channelConnection.deleteMany({
      where: { tenantId: { in: [TENANT, TENANT_B] } },
    });
    await prisma.unit.deleteMany({ where: { tenantId: { in: [TENANT, TENANT_B] } } });
    await prisma.property.deleteMany({ where: { tenantId: { in: [TENANT, TENANT_B] } } });
    await seedGraph();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reports live FK delete rules for connection children", async () => {
    const fks = await prisma.$queryRaw<
      Array<{
        constraint_name: string;
        child_table: string;
        child_column: string;
        parent_table: string;
        parent_column: string;
        delete_rule: string;
      }>
    >`
      SELECT
        tc.constraint_name::text AS constraint_name,
        tc.table_name::text AS child_table,
        kcu.column_name::text AS child_column,
        ccu.table_name::text AS parent_table,
        ccu.column_name::text AS parent_column,
        rc.delete_rule::text AS delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
       AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND (
          ccu.table_name = 'channel_connections'
          OR tc.table_name IN (
            'channel_inventory_reconciliations',
            'channel_poll_cursors',
            'channel_listing_mappings',
            'unit_calendar_blocks',
            'outbox_events',
            'background_jobs'
          )
        )
      ORDER BY child_table, constraint_name, child_column
    `;

    const recon = fks.filter((f) => f.child_table === "channel_inventory_reconciliations");
    expect(recon.some((f) => f.parent_table === "channel_connections")).toBe(true);
    expect(
      recon.find((f) => f.parent_table === "channel_connections")?.delete_rule,
    ).toBe("CASCADE");

    const cursor = fks.filter((f) => f.child_table === "channel_poll_cursors");
    expect(
      cursor.find((f) => f.parent_table === "channel_connections")?.delete_rule,
    ).toBe("CASCADE");

    expect(fks.some((f) => f.child_table === "channel_listing_mappings")).toBe(false);
    expect(
      fks.some(
        (f) =>
          f.child_table === "unit_calendar_blocks" &&
          f.child_column === "connection_id",
      ),
    ).toBe(false);
    expect(fks.some((f) => f.child_table === "outbox_events")).toBe(false);
    expect(fks.some((f) => f.child_table === "background_jobs")).toBe(false);
  });

  it("pending gen + queued job + connection delete: cascade rows, job terminals, no writes", async () => {
    await seedPendingGeneration();
    await setTenantContext(prisma, TENANT);
    await prisma.channelPollCursor.create({
      data: {
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        payload: "c1",
        version: 1,
        semanticConfigVersion: 1,
        updatedAt: new Date(),
      },
    });
    await prisma.outboxEvent.create({
      data: {
        id: "550e8400-e29b-41d4-a716-446655440740",
        tenantId: TENANT,
        aggregateType: "ChannelInventoryReconciliation",
        aggregateId: "550e8400-e29b-41d4-a716-446655440741",
        eventType: "channel.ical.inventory.reconcile.requested.v1",
        payload: { connectionId: CONNECTION_ID, cursorVersion: 1 },
        status: "pending",
        attemptCount: 0,
        deliveryKey: "c".repeat(64),
      },
    });

    const jobs = new PrismaBackgroundJobRepository();
    const enqueue = new EnqueueJobUseCase(new PrismaJobScheduler(jobs));
    const enqueued = await enqueue.execute({
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
    expect(enqueued.isSuccess).toBe(true);
    const jobId = enqueued.getValue().id;

    await prisma.channelConnection.delete({
      where: { tenantId_id: { tenantId: TENANT, id: CONNECTION_ID } },
    });

    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.channelInventoryReconciliation.count({
        where: { tenantId: TENANT, connectionId: CONNECTION_ID },
      }),
    ).toBe(0);
    expect(
      await prisma.channelPollCursor.count({
        where: { tenantId: TENANT, connectionId: CONNECTION_ID },
      }),
    ).toBe(0);
    expect(
      await prisma.channelListingMapping.count({
        where: { tenantId: TENANT, connectionId: CONNECTION_ID },
      }),
    ).toBe(1);
    expect(
      await prisma.backgroundJob.count({ where: { id: jobId } }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { id: "550e8400-e29b-41d4-a716-446655440740" },
      }),
    ).toBe(1);

    const applyResult = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(applyResult.ok).toBe(false);
    if (applyResult.ok) return;
    expect(applyResult.execution).toBe("PERMANENT_FAIL");
    expect(applyResult.code).toBe("connection_not_found");
    expect(applyResult.shouldRetryJob).toBe(false);
    // DTO-only: no durable reconciliation row remains to hold status=failed
    expect(applyResult.reconcileStatus).toBe("failed");
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
    expect(
      await prisma.unitCalendarBlock.count({
        where: { tenantId: TENANT, blockType: "channel_import" },
      }),
    ).toBe(0);

    const handler = new ReconcileIcalImportedInventoryJobHandler(
      new ReconcileIcalImportedInventoryUseCase(applyStore),
    );
    const job = await jobs.findById(jobId);
    expect(job).not.toBeNull();
    await handler.run(job!);
    await jobs.markCompleted(jobId);

    const completed = await jobs.findById(jobId);
    expect(completed?.status).toBe("completed");
    expect(completed?.attemptCount ?? 0).toBeLessThan(2);

    // Re-execution remains terminal — no retry storm
    const again = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.shouldRetryJob).toBe(false);
    }
  });

  it("previously materialized channel_import blocks survive connection deletion", async () => {
    await seedPendingGeneration();
    const applied = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(applied.ok && applied.execution).toBe("APPLY");
    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.unitCalendarBlock.count({
        where: {
          tenantId: TENANT,
          blockType: "channel_import",
          status: "active",
          connectionId: CONNECTION_ID,
        },
      }),
    ).toBe(1);

    await prisma.channelConnection.delete({
      where: { tenantId_id: { tenantId: TENANT, id: CONNECTION_ID } },
    });

    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.channelInventoryReconciliation.count({
        where: { tenantId: TENANT, connectionId: CONNECTION_ID },
      }),
    ).toBe(0);
    const survivors = await prisma.unitCalendarBlock.findMany({
      where: {
        tenantId: TENANT,
        blockType: "channel_import",
        status: "active",
      },
    });
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.connectionId).toBe(CONNECTION_ID);
    expect(survivors[0]?.sourceIdentityKey).toBe("src-del");
  });

  it("tenant isolation: tenant B cannot apply deleted tenant A connection intent", async () => {
    await seedPendingGeneration();
    await prisma.channelConnection.delete({
      where: { tenantId_id: { tenantId: TENANT, id: CONNECTION_ID } },
    });

    await prisma.tenant.upsert({
      where: { id: TENANT_B },
      create: {
        id: TENANT_B,
        name: "S6b Del B",
        slug: "int-s6b-del-b",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {},
    });

    const result = await applyStore.apply({
      tenantId: TENANT_B,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("connection_not_found");
      expect(result.shouldRetryJob).toBe(false);
    }
    expect(
      await prisma.unitCalendarBlock.count({
        where: { tenantId: TENANT_B, blockType: "channel_import" },
      }),
    ).toBe(0);
  });
});

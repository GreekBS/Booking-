import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  AvailabilityEvaluator,
  ChannelListingMapping,
  ExecuteChannelPollConnectionUseCase,
  GuestCount,
  ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
  LocalDate,
  StayPeriod,
} from "@hcp/domain";
import {
  PrismaCalendarBlockRepository,
  PrismaChannelConnectionRepository,
  PrismaChannelInventoryReconciliationApplyStore,
  PrismaChannelListingMappingRepository,
  PrismaChannelPollCursorRepository,
  PrismaChannelPollInventoryCommitStore,
} from "../../src";
import { prisma, setTenantContext } from "./helpers";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const TENANT = "550e8400-e29b-41d4-a716-446655440820";
const TENANT_B = "550e8400-e29b-41d4-a716-446655440821";
const CONNECTION_ID = "s7a-inv-connection";
const CONNECTION_OTHER = "s7a-inv-connection-other";
const MAPPING_ID = "s7a-inv-mapping";
const MAPPING_OTHER = "s7a-inv-mapping-other";
const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440822";
const PROPERTY_P2 = "550e8400-e29b-41d4-a716-446655440823";
const PROPERTY_B = "550e8400-e29b-41d4-a716-446655440826";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440824";
const UNIT_OTHER = "550e8400-e29b-41d4-a716-446655440825";
const UNIT_B = "550e8400-e29b-41d4-a716-446655440827";

function hash(ch = "a"): string {
  return ch.repeat(64);
}

function compact(i: string, s = "2026-09-10", e = "2026-09-13", h = hash("c")) {
  return { i, h, k: 1 as const, s, e };
}

function inventorySnapshot(options: {
  items: Array<{
    sourceIdentityKey: string;
    entryContentHash: string;
    identityKind: "uid_only" | "uid_rid";
    checkIn: string;
    checkOut: string;
  }>;
  observedSourceIdentityKeys: string[];
  cancelledSourceIdentityKeys?: string[];
  snapshotHash?: string;
}) {
  const canonicalJson =
    options.items.length === 0
      ? "[]"
      : JSON.stringify(
          options.items.map((item) => ({
            i: item.sourceIdentityKey,
            h: item.entryContentHash,
            k: item.identityKind === "uid_only" ? 1 : 2,
            s: item.checkIn,
            e: item.checkOut,
          })),
        );
  return {
    snapshotHash: options.snapshotHash ?? hash("d"),
    items: options.items,
    canonicalJson,
    utf8ByteLength: Buffer.byteLength(canonicalJson, "utf8"),
    completeObservedEvidence: true as const,
    observedSourceIdentityKeys: options.observedSourceIdentityKeys,
    cancelledSourceIdentityKeys: options.cancelledSourceIdentityKeys ?? [],
  };
}

function emptyBatch(cursor: string) {
  return {
    ackAllowed: true as const,
    results: [] as [],
    proposedNextCursor: cursor,
  };
}

async function seedTenantGraph(
  tenantId: string,
  slug: string,
  ids: { propertyId: string; propertyP2Id?: string; unitId: string; unitOtherId?: string },
) {
  await prisma.tenant.upsert({
    where: { id: tenantId },
    create: {
      id: tenantId,
      name: `S7a ${slug}`,
      slug: `int-s7a-${slug}`,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });
  await prisma.property.upsert({
    where: { id: ids.propertyId },
    create: {
      id: ids.propertyId,
      tenantId,
      name: "S7a Property",
      slug: `s7a-prop-${slug}`,
      status: "active",
      timezone: "UTC",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });
  if (ids.propertyP2Id) {
    await prisma.property.upsert({
      where: { id: ids.propertyP2Id },
      create: {
        id: ids.propertyP2Id,
        tenantId,
        name: "S7a Property P2",
        slug: `s7a-prop2-${slug}`,
        status: "active",
        timezone: "UTC",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {},
    });
  }
  await prisma.unit.upsert({
    where: { id: ids.unitId },
    create: {
      id: ids.unitId,
      tenantId,
      propertyId: ids.propertyId,
      name: "S7a Unit",
      slug: `s7a-unit-${slug}`,
      status: "active",
      maxGuests: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });
  if (ids.unitOtherId) {
    await prisma.unit.upsert({
      where: { id: ids.unitOtherId },
      create: {
        id: ids.unitOtherId,
        tenantId,
        propertyId: ids.propertyId,
        name: "S7a Unit Other",
        slug: `s7a-unit-other-${slug}`,
        status: "active",
        maxGuests: 4,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {},
    });
  }
}

async function seedConnection(
  tenantId: string,
  connectionId: string,
  epoch = 1,
) {
  await prisma.channelConnection.create({
    data: {
      tenantId,
      id: connectionId,
      provider: "ical",
      displayName: "S7a",
      status: "active",
      semanticMode: "availability_block_feed",
      semanticConfigVersion: epoch,
      inventoryApplyEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

runIntegration("P1-S7a authoritative inventory removal (PostgreSQL)", () => {
  const mappingRepo = new PrismaChannelListingMappingRepository();
  const commitStore = new PrismaChannelPollInventoryCommitStore(
    prisma,
    {},
    { timeout: 30_000 },
    () => true,
  );
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
    await seedTenantGraph(TENANT, "a", {
      propertyId: PROPERTY_ID,
      propertyP2Id: PROPERTY_P2,
      unitId: UNIT_ID,
      unitOtherId: UNIT_OTHER,
    });
    await seedTenantGraph(TENANT_B, "b", {
      propertyId: PROPERTY_B,
      unitId: UNIT_B,
    });
    await seedConnection(TENANT, CONNECTION_ID, 1);
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
    await prisma.$disconnect();
  });

  async function seedPendingGeneration(options: {
    cursorVersion: number;
    actionable: ReturnType<typeof compact>[];
    observed: string[];
    cancelled?: string[];
    completeObservedEvidence?: boolean;
    semanticConfigVersion?: number;
    mappingId?: string;
    mappingVersion?: number;
    unitId?: string;
    propertyId?: string;
    connectionId?: string;
    tenantId?: string;
  }) {
    const tenantId = options.tenantId ?? TENANT;
    const connectionId = options.connectionId ?? CONNECTION_ID;
    await setTenantContext(prisma, tenantId);
    await prisma.channelInventoryReconciliation.create({
      data: {
        tenantId,
        connectionId,
        cursorVersion: options.cursorVersion,
        semanticConfigVersion: options.semanticConfigVersion ?? 1,
        mappingId: options.mappingId ?? MAPPING_ID,
        mappingVersion: options.mappingVersion ?? 1,
        unitId: options.unitId ?? UNIT_ID,
        propertyId: options.propertyId ?? PROPERTY_ID,
        snapshotHash: hash("e"),
        actionableSnapshot: options.actionable,
        completeObservedEvidence: options.completeObservedEvidence ?? true,
        observedSourceIdentityKeys:
          options.completeObservedEvidence === false ? undefined : options.observed,
        cancelledSourceIdentityKeys:
          options.completeObservedEvidence === false
            ? undefined
            : (options.cancelled ?? []),
        reconcileStatus: "pending",
        createdAt: new Date(),
      },
    });
  }

  async function insertActiveImport(sourceIdentityKey: string, options?: {
    tenantId?: string;
    connectionId?: string;
    epoch?: number;
    mappingId?: string;
    unitId?: string;
    propertyId?: string;
    checkIn?: string;
    checkOut?: string;
  }) {
    const tenantId = options?.tenantId ?? TENANT;
    const connectionId = options?.connectionId ?? CONNECTION_ID;
    const unitId = options?.unitId ?? UNIT_ID;
    const propertyId = options?.propertyId ?? PROPERTY_ID;
    const mappingId = options?.mappingId ?? MAPPING_ID;
    const epoch = options?.epoch ?? 1;
    await setTenantContext(prisma, tenantId);
    await prisma.$executeRaw`
      INSERT INTO "unit_calendar_blocks" (
        "id","tenant_id","unit_id","property_id","block_type","source_id",
        "check_in","check_out","status",
        "connection_id","semantic_config_version","mapping_id",
        "source_identity_key","entry_content_hash","identity_kind",
        "created_at","updated_at"
      ) VALUES (
        gen_random_uuid(), ${tenantId}::uuid, ${unitId}::uuid, ${propertyId}::uuid,
        'channel_import'::"CalendarBlockType", NULL,
        ${(options?.checkIn ?? "2026-09-10")}::date,
        ${(options?.checkOut ?? "2026-09-13")}::date,
        'active'::"CalendarBlockStatus",
        ${connectionId}, ${epoch}, ${mappingId},
        ${sourceIdentityKey}, ${hash("f")}, 'uid_only',
        NOW(), NOW()
      )
    `;
  }

  it("removal: {A,B} → observed {A} releases B and keeps A", async () => {
    await seedPendingGeneration({
      cursorVersion: 1,
      actionable: [compact("src-a"), compact("src-b")],
      observed: ["src-a", "src-b"],
    });
    const first = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(first.ok && first.execution).toBe("APPLY");

    await seedPendingGeneration({
      cursorVersion: 2,
      actionable: [compact("src-a")],
      observed: ["src-a"],
    });
    const second = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 2,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.deactivatedCount).toBe(1);

    await setTenantContext(prisma, TENANT);
    const blocks = await prisma.unitCalendarBlock.findMany({
      where: { tenantId: TENANT, blockType: "channel_import" },
    });
    expect(blocks.find((b) => b.sourceIdentityKey === "src-a")?.status).toBe("active");
    expect(blocks.find((b) => b.sourceIdentityKey === "src-b")?.status).toBe("released");
  });

  it("availability: released B no longer blocks AvailabilityEvaluator", async () => {
    await seedPendingGeneration({
      cursorVersion: 1,
      actionable: [compact("src-b", "2026-09-10", "2026-09-13")],
      observed: ["src-b"],
    });
    await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    await seedPendingGeneration({
      cursorVersion: 2,
      actionable: [],
      observed: [],
    });
    await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 2,
    });

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
    expect(evalResult.available).toBe(true);
  });

  it("authoritative empty: TX1 pending + outbox → TX2 releases all fenced actives", async () => {
    const first = await commitStore.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      proposedNextCursor: "cursor-ab",
      inventorySnapshot: inventorySnapshot({
        items: [
          {
            sourceIdentityKey: "src-a",
            entryContentHash: hash("c"),
            identityKind: "uid_only",
            checkIn: "2026-09-10",
            checkOut: "2026-09-13",
          },
        ],
        observedSourceIdentityKeys: ["src-a"],
      }),
      batch: emptyBatch("cursor-ab"),
      loadedCursorVersion: 0,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: first.pollResult.committedCursorVersion!,
    });

    const empty = await commitStore.commit({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      provider: "ical",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: first.pollResult.committedCursorVersion!,
      proposedNextCursor: "cursor-empty",
      inventorySnapshot: inventorySnapshot({
        items: [],
        observedSourceIdentityKeys: [],
      }),
      batch: emptyBatch("cursor-empty"),
      loadedCursorVersion: first.pollResult.committedCursorVersion!,
    });
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;

    await setTenantContext(prisma, TENANT);
    const generation = await prisma.channelInventoryReconciliation.findUnique({
      where: {
        tenantId_connectionId_cursorVersion: {
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          cursorVersion: empty.pollResult.committedCursorVersion!,
        },
      },
    });
    expect(generation?.reconcileStatus).toBe("pending");
    expect(generation?.completeObservedEvidence).toBe(true);
    expect(generation?.observedSourceIdentityKeys).toEqual([]);
    const outbox = await prisma.outboxEvent.findMany({
      where: {
        tenantId: TENANT,
        eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
      },
    });
    expect(outbox.length).toBeGreaterThanOrEqual(2);
    expect(
      outbox.some((e) => {
        const payload = e.payload as { cursorVersion?: number };
        return payload.cursorVersion === empty.pollResult.committedCursorVersion;
      }),
    ).toBe(true);

    const applyEmpty = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: empty.pollResult.committedCursorVersion!,
    });
    expect(applyEmpty.ok).toBe(true);
    if (!applyEmpty.ok) return;
    expect(applyEmpty.deactivatedCount).toBe(1);

    const active = await prisma.unitCalendarBlock.count({
      where: { tenantId: TENANT, blockType: "channel_import", status: "active" },
    });
    expect(active).toBe(0);
  });

  it("failure safety: incomplete observed evidence never absence-releases", async () => {
    await insertActiveImport("src-a");
    await seedPendingGeneration({
      cursorVersion: 1,
      actionable: [],
      observed: [],
      completeObservedEvidence: false,
    });
    const result = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deactivatedCount).toBe(0);
    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.unitCalendarBlock.count({
        where: {
          tenantId: TENANT,
          sourceIdentityKey: "src-a",
          status: "active",
        },
      }),
    ).toBe(1);
  });

  it("present but non-actionable: observed retains previously active identity", async () => {
    await insertActiveImport("src-a");
    await seedPendingGeneration({
      cursorVersion: 1,
      actionable: [],
      observed: ["src-a"],
      cancelled: [],
    });
    const result = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deactivatedCount).toBe(0);
    expect(result.retainedStaleCount).toBe(1);
    await setTenantContext(prisma, TENANT);
    expect(
      (
        await prisma.unitCalendarBlock.findFirst({
          where: { tenantId: TENANT, sourceIdentityKey: "src-a" },
        })
      )?.status,
    ).toBe("active");
  });

  it("explicit STATUS:CANCELLED releases previously active identity", async () => {
    await insertActiveImport("src-a");
    await seedPendingGeneration({
      cursorVersion: 1,
      actionable: [],
      observed: ["src-a"],
      cancelled: ["src-a"],
    });
    const result = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deactivatedCount).toBe(1);
    await setTenantContext(prisma, TENANT);
    expect(
      (
        await prisma.unitCalendarBlock.findFirst({
          where: { tenantId: TENANT, sourceIdentityKey: "src-a" },
        })
      )?.status,
    ).toBe("released");
  });

  it("ownership isolation: other connection/epoch/mapping/unit/Hold/Booking untouched", async () => {
    await seedConnection(TENANT, CONNECTION_OTHER, 1);
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_OTHER,
        tenantId: TENANT,
        connectionId: CONNECTION_OTHER,
        externalListingId: "ext-other",
        propertyId: PROPERTY_ID,
        unitId: UNIT_OTHER,
        syncDirection: "inbound",
      }),
    );

    await insertActiveImport("keep-other-conn", {
      connectionId: CONNECTION_OTHER,
      mappingId: MAPPING_OTHER,
      unitId: UNIT_OTHER,
    });
    await insertActiveImport("keep-old-epoch", { epoch: 9 });
    await insertActiveImport("keep-other-unit", { unitId: UNIT_OTHER });
    await insertActiveImport("src-gone");

    await setTenantContext(prisma, TENANT);
    await prisma.$executeRaw`
      INSERT INTO "unit_calendar_blocks" (
        "id","tenant_id","unit_id","property_id","block_type","source_id",
        "check_in","check_out","status","created_at","updated_at"
      ) VALUES
      (
        gen_random_uuid(), ${TENANT}::uuid, ${UNIT_ID}::uuid, ${PROPERTY_ID}::uuid,
        'booking'::"CalendarBlockType", ${"550e8400-e29b-41d4-a716-446655440831"}::uuid,
        '2026-11-01'::date, '2026-11-03'::date, 'active'::"CalendarBlockStatus",
        NOW(), NOW()
      ),
      (
        gen_random_uuid(), ${TENANT}::uuid, ${UNIT_ID}::uuid, ${PROPERTY_ID}::uuid,
        'hold'::"CalendarBlockType", ${"550e8400-e29b-41d4-a716-446655440832"}::uuid,
        '2026-12-01'::date, '2026-12-03'::date, 'active'::"CalendarBlockStatus",
        NOW(), NOW()
      )
    `;

    await seedPendingGeneration({
      cursorVersion: 1,
      actionable: [],
      observed: [],
    });
    const result = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deactivatedCount).toBe(1);

    await setTenantContext(prisma, TENANT);
    expect(
      (
        await prisma.unitCalendarBlock.findFirst({
          where: { sourceIdentityKey: "keep-other-conn", status: "active" },
        })
      )?.status,
    ).toBe("active");
    expect(
      (
        await prisma.unitCalendarBlock.findFirst({
          where: { sourceIdentityKey: "keep-old-epoch", status: "active" },
        })
      )?.status,
    ).toBe("active");
    expect(
      (
        await prisma.unitCalendarBlock.findFirst({
          where: { sourceIdentityKey: "keep-other-unit", status: "active" },
        })
      )?.status,
    ).toBe("active");
    expect(
      await prisma.unitCalendarBlock.count({
        where: { tenantId: TENANT, blockType: "booking", status: "active" },
      }),
    ).toBe(1);
    expect(
      await prisma.unitCalendarBlock.count({
        where: { tenantId: TENANT, blockType: "hold", status: "active" },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.unitCalendarBlock.findFirst({
          where: { sourceIdentityKey: "src-gone" },
        })
      )?.status,
    ).toBe("released");
  });

  it("idempotent re-apply is NOOP with no duplicate actives", async () => {
    await seedPendingGeneration({
      cursorVersion: 1,
      actionable: [compact("src-a")],
      observed: ["src-a"],
    });
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
    expect(
      await prisma.unitCalendarBlock.count({
        where: {
          tenantId: TENANT,
          sourceIdentityKey: "src-a",
          status: "active",
        },
      }),
    ).toBe(1);
  });

  it("ordering: late G10 cannot release/rewrite inventory after G11", async () => {
    await seedPendingGeneration({
      cursorVersion: 11,
      actionable: [compact("src-b")],
      observed: ["src-b"],
    });
    await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 11,
    });

    await seedPendingGeneration({
      cursorVersion: 10,
      actionable: [compact("src-a")],
      observed: ["src-a"],
    });
    const late = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 10,
    });
    expect(late.ok && late.execution).toBe("SUPERSEDE");

    await setTenantContext(prisma, TENANT);
    const blocks = await prisma.unitCalendarBlock.findMany({
      where: { tenantId: TENANT, blockType: "channel_import", status: "active" },
    });
    expect(blocks.map((b) => b.sourceIdentityKey)).toEqual(["src-b"]);
  });

  it("concurrency: two TX2 workers on different generations serialize safely", async () => {
    await seedPendingGeneration({
      cursorVersion: 1,
      actionable: [compact("src-a"), compact("src-b")],
      observed: ["src-a", "src-b"],
    });
    await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });

    await seedPendingGeneration({
      cursorVersion: 2,
      actionable: [compact("src-a")],
      observed: ["src-a"],
    });
    await seedPendingGeneration({
      cursorVersion: 3,
      actionable: [],
      observed: [],
    });

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
    const [r2, r3] = await Promise.all([
      a.apply({ tenantId: TENANT, connectionId: CONNECTION_ID, cursorVersion: 2 }),
      b.apply({ tenantId: TENANT, connectionId: CONNECTION_ID, cursorVersion: 3 }),
    ]);
    expect(r2.ok && r3.ok).toBe(true);

    await setTenantContext(prisma, TENANT);
    const g2 = await prisma.channelInventoryReconciliation.findUnique({
      where: {
        tenantId_connectionId_cursorVersion: {
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          cursorVersion: 2,
        },
      },
    });
    const g3 = await prisma.channelInventoryReconciliation.findUnique({
      where: {
        tenantId_connectionId_cursorVersion: {
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          cursorVersion: 3,
        },
      },
    });
    expect(["applied", "superseded"]).toContain(g2?.reconcileStatus);
    expect(["applied", "superseded"]).toContain(g3?.reconcileStatus);
    expect(
      [g2?.reconcileStatus, g3?.reconcileStatus].filter((s) => s === "applied"),
    ).toHaveLength(1);

    const active = await prisma.unitCalendarBlock.findMany({
      where: { tenantId: TENANT, blockType: "channel_import", status: "active" },
    });
    if (g3?.reconcileStatus === "applied") {
      expect(active).toHaveLength(0);
    } else {
      expect(active.map((x) => x.sourceIdentityKey).sort()).toEqual(["src-a"]);
    }
  });

  it("reappearance: released historical row remains; new active row is inserted", async () => {
    await seedPendingGeneration({
      cursorVersion: 1,
      actionable: [compact("src-a")],
      observed: ["src-a"],
    });
    await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    await seedPendingGeneration({
      cursorVersion: 2,
      actionable: [],
      observed: [],
    });
    await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 2,
    });
    await seedPendingGeneration({
      cursorVersion: 3,
      actionable: [compact("src-a", "2026-10-01", "2026-10-04")],
      observed: ["src-a"],
    });
    const again = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 3,
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.createdCount).toBe(1);

    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.unitCalendarBlock.count({
        where: { tenantId: TENANT, sourceIdentityKey: "src-a", status: "active" },
      }),
    ).toBe(1);
    expect(
      await prisma.unitCalendarBlock.count({
        where: { tenantId: TENANT, sourceIdentityKey: "src-a", status: "released" },
      }),
    ).toBe(1);
  });

  it("property-only rematerialization can coexist with authoritative removal", async () => {
    await seedPendingGeneration({
      cursorVersion: 1,
      actionable: [compact("src-a"), compact("src-b")],
      observed: ["src-a", "src-b"],
      mappingVersion: 1,
      propertyId: PROPERTY_ID,
    });
    await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });

    await setTenantContext(prisma, TENANT);
    await prisma.channelListingMapping.update({
      where: {
        tenantId_id: { tenantId: TENANT, id: MAPPING_ID },
      },
      data: {
        propertyId: PROPERTY_P2,
        mappingVersion: 2,
      },
    });

    await seedPendingGeneration({
      cursorVersion: 2,
      actionable: [compact("src-a")],
      observed: ["src-a"],
      mappingVersion: 2,
      propertyId: PROPERTY_P2,
    });
    const result = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deactivatedCount).toBe(1);

    await setTenantContext(prisma, TENANT);
    const a = await prisma.unitCalendarBlock.findFirst({
      where: { sourceIdentityKey: "src-a", status: "active" },
    });
    expect(a?.propertyId).toBe(PROPERTY_P2);
    expect(
      (
        await prisma.unitCalendarBlock.findFirst({
          where: { sourceIdentityKey: "src-b" },
        })
      )?.status,
    ).toBe("released");
  });

  it("OFF→ON invariant: empty authoritative snapshot still creates pending generation", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    const snap = inventorySnapshot({
      items: [],
      observedSourceIdentityKeys: [],
    });
    const connections = new PrismaChannelConnectionRepository();
    const cursors = new PrismaChannelPollCursorRepository();
    const pollBatchUseCase = {
      execute: async () => ({
        ackAllowed: true as const,
        results: [] as [],
        proposedNextCursor: "empty-feed-A",
        inventoryActionableSnapshot: snap,
        inventoryProjectionFailureCode: null,
      }),
    };

    try {
      process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "false";
      const offStore = new PrismaChannelPollInventoryCommitStore(
        prisma,
        {},
        { timeout: 30_000 },
        () => false,
      );
      const offResult = await new ExecuteChannelPollConnectionUseCase(
        connections,
        cursors,
        pollBatchUseCase as never,
        offStore,
      ).execute({ tenantId: TENANT, connectionId: CONNECTION_ID });
      expect(offResult.committedCursorVersion).toBe(1);
      await setTenantContext(prisma, TENANT);
      expect(
        await prisma.channelInventoryReconciliation.count({ where: { tenantId: TENANT } }),
      ).toBe(0);

      process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
      const onStore = new PrismaChannelPollInventoryCommitStore(
        prisma,
        {},
        { timeout: 30_000 },
        () => true,
      );
      const onResult = await new ExecuteChannelPollConnectionUseCase(
        connections,
        cursors,
        pollBatchUseCase as never,
        onStore,
      ).execute({ tenantId: TENANT, connectionId: CONNECTION_ID });
      expect(onResult.cursorAdvanced).toBe(true);
      expect(onResult.committedCursorVersion).toBe(2);

      await setTenantContext(prisma, TENANT);
      const gens = await prisma.channelInventoryReconciliation.findMany({
        where: { tenantId: TENANT, connectionId: CONNECTION_ID },
      });
      expect(gens).toHaveLength(1);
      expect(gens[0]?.reconcileStatus).toBe("pending");
      expect(gens[0]?.completeObservedEvidence).toBe(true);
      expect(gens[0]?.observedSourceIdentityKeys).toEqual([]);
      expect(
        await prisma.outboxEvent.count({
          where: {
            tenantId: TENANT,
            eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
          },
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

  it("tenant isolation: tenant B inventory release does not touch tenant A", async () => {
    await seedConnection(TENANT_B, CONNECTION_ID, 1);
    await mappingRepo.save(
      ChannelListingMapping.createActive({
        id: MAPPING_ID,
        tenantId: TENANT_B,
        connectionId: CONNECTION_ID,
        externalListingId: "ext-b",
        propertyId: PROPERTY_B,
        unitId: UNIT_B,
        syncDirection: "inbound",
      }),
    );

    await insertActiveImport("src-a", { tenantId: TENANT });
    await insertActiveImport("src-a", {
      tenantId: TENANT_B,
      propertyId: PROPERTY_B,
      unitId: UNIT_B,
    });

    await seedPendingGeneration({
      tenantId: TENANT_B,
      cursorVersion: 1,
      actionable: [],
      observed: [],
      propertyId: PROPERTY_B,
      unitId: UNIT_B,
    });
    const result = await applyStore.apply({
      tenantId: TENANT_B,
      connectionId: CONNECTION_ID,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deactivatedCount).toBe(1);

    await setTenantContext(prisma, TENANT);
    expect(
      (
        await prisma.unitCalendarBlock.findFirst({
          where: { tenantId: TENANT, sourceIdentityKey: "src-a" },
        })
      )?.status,
    ).toBe("active");
    await setTenantContext(prisma, TENANT_B);
    expect(
      (
        await prisma.unitCalendarBlock.findFirst({
          where: { tenantId: TENANT_B, sourceIdentityKey: "src-a" },
        })
      )?.status,
    ).toBe("released");
  });
});

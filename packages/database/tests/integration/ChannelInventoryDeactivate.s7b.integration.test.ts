import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  AvailabilityEvaluator,
  DeactivateChannelConnectionInventoryUseCase,
  GuestCount,
  LocalDate,
  PermissionChecker,
  StayPeriod,
} from "@hcp/domain";
import {
  PrismaCalendarBlockRepository,
  PrismaChannelConnectionRepository,
  PrismaDeactivateChannelConnectionInventoryStore,
  PrismaEligibleIcalPollConnectionReader,
} from "../../src";
import { prisma, setTenantContext, truncateIntegrationTables } from "./helpers";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const TENANT = "550e8400-e29b-41d4-a716-446655440830";
const TENANT_B = "550e8400-e29b-41d4-a716-446655440831";
const ACTOR = "550e8400-e29b-41d4-a716-446655440832";
const CONNECTION_ID = "s7b-rb-connection";
const CONNECTION_OTHER = "s7b-rb-connection-other";
const MAPPING_ID = "s7b-rb-mapping";
const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440833";
const PROPERTY_B = "550e8400-e29b-41d4-a716-446655440834";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440835";
const UNIT_B = "550e8400-e29b-41d4-a716-446655440836";

function hash(ch = "a"): string {
  return ch.repeat(64);
}

async function seedTenant(
  tenantId: string,
  slug: string,
  ids: { propertyId: string; unitId: string },
) {
  await prisma.tenant.upsert({
    where: { id: tenantId },
    create: {
      id: tenantId,
      name: `S7b ${slug}`,
      slug: `int-s7b-${slug}`,
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
      name: "S7b Property",
      slug: `s7b-prop-${slug}`,
      status: "active",
      timezone: "UTC",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });
  await prisma.unit.upsert({
    where: { id: ids.unitId },
    create: {
      id: ids.unitId,
      tenantId,
      propertyId: ids.propertyId,
      name: "S7b Unit",
      slug: `s7b-unit-${slug}`,
      status: "active",
      maxGuests: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });
}

async function seedActiveIcalConnection(
  tenantId: string,
  connectionId: string,
  epoch = 1,
) {
  await prisma.channelConnection.create({
    data: {
      tenantId,
      id: connectionId,
      provider: "ical",
      displayName: "S7b RB",
      status: "active",
      credentialRef: "cred_s7b_rb",
      semanticMode: "availability_block_feed",
      semanticConfigVersion: epoch,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  await prisma.channelListingMapping.create({
    data: {
      id: `${connectionId}-map`,
      tenantId,
      connectionId,
      externalListingId: "ext",
      propertyId: tenantId === TENANT ? PROPERTY_ID : PROPERTY_B,
      unitId: tenantId === TENANT ? UNIT_ID : UNIT_B,
      status: "active",
      mappingVersion: 1,
      syncDirection: "inbound",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

async function insertActiveImport(options: {
  tenantId: string;
  connectionId: string;
  epoch: number;
  mappingId: string;
  unitId: string;
  propertyId: string;
  sourceIdentityKey: string;
  checkIn?: string;
  checkOut?: string;
}) {
  await setTenantContext(prisma, options.tenantId);
  await prisma.$executeRaw`
    INSERT INTO "unit_calendar_blocks" (
      "id","tenant_id","unit_id","property_id","block_type","source_id",
      "check_in","check_out","status",
      "connection_id","semantic_config_version","mapping_id",
      "source_identity_key","entry_content_hash","identity_kind",
      "created_at","updated_at"
    ) VALUES (
      gen_random_uuid(), ${options.tenantId}::uuid, ${options.unitId}::uuid, ${options.propertyId}::uuid,
      'channel_import'::"CalendarBlockType", NULL,
      ${(options.checkIn ?? "2026-09-10")}::date,
      ${(options.checkOut ?? "2026-09-13")}::date,
      'active'::"CalendarBlockStatus",
      ${options.connectionId}, ${options.epoch}, ${options.mappingId},
      ${options.sourceIdentityKey}, ${hash("f")}, 'uid_only',
      NOW(), NOW()
    )
  `;
}

runIntegration("P1-S7b inventory deactivate rollback (PostgreSQL)", () => {
  const connectionRepo = new PrismaChannelConnectionRepository();
  const store = new PrismaDeactivateChannelConnectionInventoryStore();
  const useCase = new DeactivateChannelConnectionInventoryUseCase(
    connectionRepo,
    store,
    new PermissionChecker(),
  );
  const eligibleReader = new PrismaEligibleIcalPollConnectionReader();

  beforeEach(async () => {
    await truncateIntegrationTables();
    await prisma.user.create({
      data: {
        id: ACTOR,
        email: "s7b-rb@integration.test",
        name: "S7b Rollback",
      },
    });
    await seedTenant(TENANT, "a", { propertyId: PROPERTY_ID, unitId: UNIT_ID });
    await seedTenant(TENANT_B, "b", { propertyId: PROPERTY_B, unitId: UNIT_B });
    await seedActiveIcalConnection(TENANT, CONNECTION_ID, 2);
    await seedActiveIcalConnection(TENANT, CONNECTION_OTHER, 1);
    await seedActiveIcalConnection(TENANT_B, `${CONNECTION_ID}-b`, 1);

    await insertActiveImport({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      epoch: 1,
      mappingId: MAPPING_ID,
      unitId: UNIT_ID,
      propertyId: PROPERTY_ID,
      sourceIdentityKey: "epoch1-a",
    });
    await insertActiveImport({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      epoch: 2,
      mappingId: MAPPING_ID,
      unitId: UNIT_ID,
      propertyId: PROPERTY_ID,
      sourceIdentityKey: "epoch2-a",
      checkIn: "2026-09-20",
      checkOut: "2026-09-22",
    });
    await insertActiveImport({
      tenantId: TENANT,
      connectionId: CONNECTION_OTHER,
      epoch: 1,
      mappingId: `${MAPPING_ID}-other`,
      unitId: UNIT_ID,
      propertyId: PROPERTY_ID,
      sourceIdentityKey: "other-conn",
      checkIn: "2026-10-01",
      checkOut: "2026-10-03",
    });
    await insertActiveImport({
      tenantId: TENANT_B,
      connectionId: `${CONNECTION_ID}-b`,
      epoch: 1,
      mappingId: `${MAPPING_ID}-b`,
      unitId: UNIT_B,
      propertyId: PROPERTY_B,
      sourceIdentityKey: "other-tenant",
    });

    const HOLD_SOURCE = "550e8400-e29b-41d4-a716-446655440837";
    const BOOKING_SOURCE = "550e8400-e29b-41d4-a716-446655440838";
    await setTenantContext(prisma, TENANT);
    await prisma.$executeRaw`
      INSERT INTO "unit_calendar_blocks" (
        "id","tenant_id","unit_id","property_id","block_type","source_id",
        "check_in","check_out","status","created_at","updated_at"
      ) VALUES (
        gen_random_uuid(), ${TENANT}::uuid, ${UNIT_ID}::uuid, ${PROPERTY_ID}::uuid,
        'hold'::"CalendarBlockType", ${HOLD_SOURCE}::uuid,
        '2026-11-01'::date, '2026-11-03'::date,
        'active'::"CalendarBlockStatus", NOW(), NOW()
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO "unit_calendar_blocks" (
        "id","tenant_id","unit_id","property_id","block_type","source_id",
        "check_in","check_out","status","created_at","updated_at"
      ) VALUES (
        gen_random_uuid(), ${TENANT}::uuid, ${UNIT_ID}::uuid, ${PROPERTY_ID}::uuid,
        'booking'::"CalendarBlockType", ${BOOKING_SOURCE}::uuid,
        '2026-12-01'::date, '2026-12-03'::date,
        'active'::"CalendarBlockStatus", NOW(), NOW()
      )
    `;
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("releases all epochs for target connection, pauses, leaves Hold/Booking/other untouched", async () => {
    const actor = {
      userId: ACTOR,
      role: "admin" as const,
      propertyIds: null,
      isSuperAdmin: true,
    };

    const result = await useCase.execute(
      { tenantId: TENANT, connectionId: CONNECTION_ID },
      actor,
      { actorId: ACTOR, ipAddress: "127.0.0.1" },
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toMatchObject({
      connectionStatus: "paused",
      releasedCount: 2,
      alreadyPaused: false,
    });

    await setTenantContext(prisma, TENANT);
    const connection = await prisma.channelConnection.findUnique({
      where: { tenantId_id: { tenantId: TENANT, id: CONNECTION_ID } },
    });
    expect(connection?.status).toBe("paused");

    const targetImports = await prisma.unitCalendarBlock.findMany({
      where: {
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        blockType: "channel_import",
      },
    });
    expect(targetImports.every((b) => b.status === "released")).toBe(true);

    const otherConn = await prisma.unitCalendarBlock.findFirst({
      where: {
        tenantId: TENANT,
        connectionId: CONNECTION_OTHER,
        blockType: "channel_import",
      },
    });
    expect(otherConn?.status).toBe("active");

    const hold = await prisma.unitCalendarBlock.findFirst({
      where: { tenantId: TENANT, blockType: "hold", sourceId: "550e8400-e29b-41d4-a716-446655440837" },
    });
    const booking = await prisma.unitCalendarBlock.findFirst({
      where: { tenantId: TENANT, blockType: "booking", sourceId: "550e8400-e29b-41d4-a716-446655440838" },
    });
    expect(hold?.status).toBe("active");
    expect(booking?.status).toBe("active");

    await setTenantContext(prisma, TENANT_B);
    const otherTenant = await prisma.unitCalendarBlock.findFirst({
      where: {
        tenantId: TENANT_B,
        connectionId: `${CONNECTION_ID}-b`,
        blockType: "channel_import",
      },
    });
    expect(otherTenant?.status).toBe("active");

    const audits = await prisma.auditLog.findMany({
      where: {
        tenantId: TENANT,
        action: "channel.connection.inventory_deactivated",
        resourceId: CONNECTION_ID,
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.metadata).toMatchObject({
      releasedCount: 2,
      pausedByRollback: true,
    });

    await setTenantContext(prisma, TENANT);
    const calendar = new PrismaCalendarBlockRepository();
    const active = await calendar.findActiveBlocks(UNIT_ID, TENANT);
    const availability = new AvailabilityEvaluator().evaluate({
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
    expect(availability.available).toBe(true);

    const eligible = await eligibleReader.listEligible();
    expect(
      eligible.some(
        (row) => row.tenantId === TENANT && row.connectionId === CONNECTION_ID,
      ),
    ).toBe(false);
  });

  it("repeat rollback is idempotent", async () => {
    const actor = {
      userId: ACTOR,
      role: "admin" as const,
      propertyIds: null,
      isSuperAdmin: true,
    };
    await useCase.execute(
      { tenantId: TENANT, connectionId: CONNECTION_ID },
      actor,
      { actorId: ACTOR, ipAddress: null },
    );
    const second = await useCase.execute(
      { tenantId: TENANT, connectionId: CONNECTION_ID },
      actor,
      { actorId: ACTOR, ipAddress: null },
    );
    expect(second.isSuccess).toBe(true);
    expect(second.getValue()).toMatchObject({
      connectionStatus: "paused",
      releasedCount: 0,
      alreadyPaused: true,
    });
  });
});

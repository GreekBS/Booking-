/**
 * CleaningLocation V1 integration (requires TEST_DATABASE_URL).
 * Covers bulk isolation, concurrency, rename id stability, board shape.
 */
import { it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { ConflictError } from "@hcp/domain";
import {
  PrismaCleaningLocationRepository,
  PrismaCleaningLocationQrAccessRepository,
} from "../../src";
import { prisma, clearTenantContext } from "./helpers";
import { runIntegration } from "./integrationGate";

const TENANT = randomUUID();
const PROP_EMPTY = randomUUID();
const PROP_VILLA = randomUUID();
const UNIT_VILLA = randomUUID();
const USER = randomUUID();

runIntegration("CleaningLocation V1", () => {
  const locations = new PrismaCleaningLocationRepository();
  const qr = new PrismaCleaningLocationQrAccessRepository();

  beforeAll(async () => {
    await clearTenantContext(prisma);
    await prisma.user.create({
      data: {
        id: USER,
        email: `cl-v1-${USER.slice(0, 8)}@demo.test`,
        name: "CL V1",
      },
    });
    await prisma.tenant.create({
      data: {
        id: TENANT,
        name: "CL V1 Tenant",
        slug: `cl-v1-${TENANT.slice(0, 8)}`,
      },
    });
    await prisma.property.createMany({
      data: [
        {
          id: PROP_EMPTY,
          tenantId: TENANT,
          name: "Hotel Empty",
          slug: `he-${PROP_EMPTY.slice(0, 8)}`,
          timezone: "Europe/Athens",
        },
        {
          id: PROP_VILLA,
          tenantId: TENANT,
          name: "Villa One",
          slug: `vo-${PROP_VILLA.slice(0, 8)}`,
          timezone: "Europe/Athens",
        },
      ],
    });
    await prisma.unit.create({
      data: {
        id: UNIT_VILLA,
        tenantId: TENANT,
        propertyId: PROP_VILLA,
        name: "Olivia",
        slug: `ol-${UNIT_VILLA.slice(0, 8)}`,
        maxGuests: 6,
      },
    });
  });

  afterAll(async () => {
    await clearTenantContext(prisma);
    await prisma.cleaningLocationQrAccess.deleteMany({ where: { tenantId: TENANT } });
    await prisma.cleaningLocationStatus.deleteMany({ where: { tenantId: TENANT } });
    await prisma.cleaningLocation.deleteMany({ where: { tenantId: TENANT } });
    await prisma.unit.deleteMany({ where: { tenantId: TENANT } });
    await prisma.property.deleteMany({ where: { tenantId: TENANT } });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.$disconnect();
  });

  it("bulk creates N locations without creating Units", async () => {
    const unitsBefore = await prisma.unit.count({
      where: { tenantId: TENANT, deletedAt: null },
    });
    const created = await locations.bulkCreate({
      tenantId: TENANT,
      propertyId: PROP_EMPTY,
      count: 30,
      actorUserId: USER,
    });
    expect(created).toHaveLength(30);
    expect(created.map((c) => c.name)).toEqual(
      Array.from({ length: 30 }, (_, i) => String(i + 1)),
    );
    expect(created.every((c) => c.commercialUnitId === null)).toBe(true);

    const unitsAfter = await prisma.unit.count({
      where: { tenantId: TENANT, deletedAt: null },
    });
    expect(unitsAfter).toBe(unitsBefore);

    await expect(
      locations.bulkCreate({
        tenantId: TENANT,
        propertyId: PROP_EMPTY,
        count: 5,
        actorUserId: USER,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("concurrent bulk init does not duplicate", async () => {
    const prop = randomUUID();
    await prisma.property.create({
      data: {
        id: prop,
        tenantId: TENANT,
        name: "Concurrent Prop",
        slug: `cp-${prop.slice(0, 8)}`,
        timezone: "Europe/Athens",
      },
    });

    const results = await Promise.allSettled([
      locations.bulkCreate({
        tenantId: TENANT,
        propertyId: prop,
        count: 10,
        actorUserId: USER,
      }),
      locations.bulkCreate({
        tenantId: TENANT,
        propertyId: prop,
        count: 10,
        actorUserId: USER,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const count = await locations.countActiveByProperty(TENANT, prop);
    expect(count).toBe(10);
  });

  it("rename keeps id and does not rotate QR", async () => {
    const [first] = await locations.listActiveByProperty(TENANT, PROP_EMPTY);
    expect(first).toBeTruthy();

    const issued = await qr.issue({
      tenantId: TENANT,
      propertyId: PROP_EMPTY,
      cleaningLocationId: first!.id,
      tokenHash: `hash-${first!.id}`,
      rotate: false,
    });
    expect(issued.issued).toBe(true);

    const renamed = await locations.rename({
      tenantId: TENANT,
      locationId: first!.id,
      name: "Junior Suite",
    });
    expect(renamed.id).toBe(first!.id);
    expect(renamed.name).toBe("Junior Suite");

    const activeQr = await qr.findActiveByLocation(TENANT, first!.id);
    expect(activeQr?.id).toBe(issued.record.id);
    expect(activeQr?.tokenHash).toBe(`hash-${first!.id}`);
  });

  it("board returns summary rows without N+1 token fields", async () => {
    const board = await locations.getBoard(TENANT, PROP_EMPTY);
    expect(board.length).toBeGreaterThanOrEqual(30);
    expect(board.every((row) => typeof row.hasActiveQr === "boolean")).toBe(true);
    expect(board.some((row) => "token" in row)).toBe(false);
  });

  it("villa-style add with commercialUnitId link does not create extra units", async () => {
    const unitsBefore = await prisma.unit.count({
      where: { tenantId: TENANT, propertyId: PROP_VILLA, deletedAt: null },
    });
    expect(unitsBefore).toBe(1);

    const loc = await locations.add({
      tenantId: TENANT,
      propertyId: PROP_VILLA,
      name: "Olivia",
      actorUserId: USER,
      commercialUnitId: UNIT_VILLA,
    });
    expect(loc.commercialUnitId).toBe(UNIT_VILLA);

    const unitsAfter = await prisma.unit.count({
      where: { tenantId: TENANT, propertyId: PROP_VILLA, deletedAt: null },
    });
    expect(unitsAfter).toBe(1);

    // Villa already has a location — bulk must reject
    await expect(
      locations.bulkCreate({
        tenantId: TENANT,
        propertyId: PROP_VILLA,
        count: 5,
        actorUserId: USER,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

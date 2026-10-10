/**
 * Phase C3 — atomic bulk Unit creation under property lock.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  BulkCreateUnitsUseCase,
  ConflictError,
  PermissionChecker,
  RoomType,
} from "@hcp/domain";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaPropertyRepository } from "../../src/repositories/PropertyRepository";
import { PrismaRoomTypeRepository } from "../../src/repositories/RoomTypeRepository";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import {
  clearTenantContext,
  prisma,
  withTenantTransaction,
} from "./helpers";
import { runIntegration } from "./integrationGate";

const TENANT = randomUUID();
const PROP = randomUUID();
const RT = randomUUID();
const SLUG = `int-c3-${TENANT.slice(0, 8)}`;

const outbox = new PrismaOutboxRepository();
const propertyRepository = new PrismaPropertyRepository(outbox);
const roomTypeRepository = new PrismaRoomTypeRepository();
const idGenerator = new UuidIdGenerator();
const permissionChecker = new PermissionChecker();

const admin = {
  userId: randomUUID(),
  tenantId: TENANT,
  role: "admin" as const,
  propertyIds: null,
};

runIntegration("BulkCreateUnits C3", () => {
  beforeAll(async () => {
    await clearTenantContext(prisma);
    await prisma.tenant.create({
      data: { id: TENANT, name: "C3 Tenant", slug: SLUG },
    });
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.property.create({
        data: {
          id: PROP,
          tenantId: TENANT,
          name: "C3 Hotel",
          slug: `c3-hotel-${PROP.slice(0, 6)}`,
          type: "hotel",
          status: "active",
        },
      });
      await tx.unit.create({
        data: {
          id: randomUUID(),
          tenantId: TENANT,
          propertyId: PROP,
          name: "Entire Property",
          slug: "entire-property",
          maxGuests: 2,
        },
      });
    });

    await roomTypeRepository.save(
      RoomType.create({
        id: RT,
        tenantId: TENANT,
        propertyId: PROP,
        name: "Standard Double",
        code: "STD",
        maxGuests: 2,
      }),
    );
  });

  afterAll(async () => {
    await clearTenantContext(prisma);
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.unit.deleteMany({ where: { tenantId: TENANT } });
      await tx.roomType.deleteMany({ where: { tenantId: TENANT } });
      await tx.outboxEvent.deleteMany({ where: { tenantId: TENANT } });
      await tx.property.deleteMany({ where: { tenantId: TENANT } });
    });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.$disconnect();
  });

  it("bulk creates 20 bookable units atomically", async () => {
    const uc = new BulkCreateUnitsUseCase(
      propertyRepository,
      roomTypeRepository,
      permissionChecker,
      idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 20 },
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().units).toHaveLength(20);

    const count = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({
        where: { tenantId: TENANT, propertyId: PROP, deletedAt: null },
      }),
    );
    // Entire Property + 20
    expect(count).toBe(21);

    const linked = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({
        where: {
          tenantId: TENANT,
          propertyId: PROP,
          roomTypeId: RT,
          deletedAt: null,
        },
      }),
    );
    expect(linked).toBe(20);

    // EXCLUDE constraint still present
    const exclude = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'unit_calendar_blocks'
        AND c.conname = 'unit_calendar_no_overlap'
    `;
    expect(exclude).toHaveLength(1);
  });

  it("rejects overlapping bulk create with Conflict/Validation", async () => {
    const uc = new BulkCreateUnitsUseCase(
      propertyRepository,
      roomTypeRepository,
      permissionChecker,
      idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 5 },
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
  });

  it("rejects and creates no partial rooms when a room number already exists", async () => {
    const before = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({ where: { tenantId: TENANT, propertyId: PROP } }),
    );

    // Pre-create room 302 so a 301–303 batch fails advisory validation under lock.
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.unit.create({
        data: {
          id: randomUUID(),
          tenantId: TENANT,
          propertyId: PROP,
          name: "Trap 302",
          slug: "trap-302",
          maxGuests: 2,
          roomNumber: "302",
        },
      });
    });

    const uc = new BulkCreateUnitsUseCase(
      propertyRepository,
      roomTypeRepository,
      permissionChecker,
      idGenerator,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 301, count: 3 },
      },
      admin,
    );
    expect(result.isFailure).toBe(true);

    const partial = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({
        where: {
          tenantId: TENANT,
          propertyId: PROP,
          roomNumber: { in: ["301", "303"] },
        },
      }),
    );
    expect(partial).toBe(0);

    const total = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({ where: { tenantId: TENANT, propertyId: PROP } }),
    );
    // Baseline + trap only
    expect(total).toBe(before + 1);
    void ConflictError;
  });
});

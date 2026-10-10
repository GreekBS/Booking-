/**
 * Phase C3-H2b — atomic bulk Unit creation with RatePlan template copy.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  BulkCreateUnitsUseCase,
  PermissionChecker,
  RoomType,
} from "@hcp/domain";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaPropertyRepository } from "../../src/repositories/PropertyRepository";
import { PrismaRoomTypeRepository } from "../../src/repositories/RoomTypeRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
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
const TEMPLATE_UNIT = randomUUID();
const SLUG = `int-h2b-${TENANT.slice(0, 8)}`;

const outbox = new PrismaOutboxRepository();
const propertyRepository = new PrismaPropertyRepository(outbox);
const roomTypeRepository = new PrismaRoomTypeRepository();
const ratePlanRepository = new PrismaRatePlanRepository();
const idGenerator = new UuidIdGenerator();
const permissionChecker = new PermissionChecker();

const admin = {
  userId: randomUUID(),
  tenantId: TENANT,
  role: "admin" as const,
  propertyIds: null,
};

function useCase() {
  return new BulkCreateUnitsUseCase(
    propertyRepository,
    roomTypeRepository,
    permissionChecker,
    idGenerator,
    undefined,
    ratePlanRepository,
    outbox,
  );
}

runIntegration("BulkCreateUnits C3-H2b", () => {
  beforeAll(async () => {
    await clearTenantContext(prisma);
    await prisma.tenant.create({
      data: { id: TENANT, name: "H2b Tenant", slug: SLUG },
    });
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.property.create({
        data: {
          id: PROP,
          tenantId: TENANT,
          name: "H2b Hotel",
          slug: `h2b-hotel-${PROP.slice(0, 6)}`,
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
          status: "inactive",
        },
      });
      await tx.unit.create({
        data: {
          id: TEMPLATE_UNIT,
          tenantId: TENANT,
          propertyId: PROP,
          name: "Standard Double 100",
          slug: "room-100",
          maxGuests: 2,
          roomNumber: "100",
          status: "active",
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

    // Link template unit to RoomType + seed a priced RatePlan
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.unit.update({
        where: { id: TEMPLATE_UNIT },
        data: { roomTypeId: RT },
      });
    });

    await ratePlanRepository.save(TENANT, TEMPLATE_UNIT, {
      baseNightlyAmount: "150.0000",
      currency: "EUR",
      seasons: [
        {
          id: randomUUID(),
          name: "Summer",
          startDate: "2025-07-01",
          endDate: "2025-08-31",
          nightlyAmount: "220.0000",
        },
      ],
      dowModifiers: [
        { dayOfWeek: 5, modifierType: "percent", modifierValue: "10.0000" },
      ],
      losDiscounts: [],
    });
  });

  afterAll(async () => {
    await clearTenantContext(prisma);
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.rateDowModifier.deleteMany({ where: { tenantId: TENANT } });
      await tx.rateSeason.deleteMany({ where: { tenantId: TENANT } });
      await tx.ratePlan.deleteMany({ where: { tenantId: TENANT } });
      await tx.unit.deleteMany({ where: { tenantId: TENANT } });
      await tx.roomType.deleteMany({ where: { tenantId: TENANT } });
      await tx.outboxEvent.deleteMany({ where: { tenantId: TENANT } });
      await tx.property.deleteMany({ where: { tenantId: TENANT } });
    });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.$disconnect();
  });

  it("bulk creates priced units from template with unique seasons and outbox rates", async () => {
    const result = await useCase().execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 5 },
        templateUnitId: TEMPLATE_UNIT,
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().units).toHaveLength(5);
    expect(result.getValue().pricingTemplate).toMatchObject({
      templateUnitId: TEMPLATE_UNIT,
      copiedFromTemplate: true,
      baseNightlyAmount: "150.0000",
      currency: "EUR",
      seasonCount: 1,
      dowModifierCount: 1,
    });

    const unitIds = result.getValue().units.map((u) => u.id);
    const plans = await ratePlanRepository.findByUnitIds(unitIds, TENANT);
    expect(plans.size).toBe(5);

    const seasonIds: string[] = [];
    for (const unitId of unitIds) {
      const plan = plans.get(unitId)!;
      expect(Number(plan.baseNightlyAmount)).toBe(150);
      expect(Number(plan.seasons[0]?.nightlyAmount)).toBe(220);
      expect(Number(plan.dowModifiers[0]?.modifierValue)).toBe(10);
      seasonIds.push(plan.seasons[0]!.id);
    }
    expect(new Set(seasonIds).size).toBe(5);

    const rateEvents = await withTenantTransaction(TENANT, async (tx) =>
      tx.outboxEvent.count({
        where: {
          tenantId: TENANT,
          eventType: "UnitExternalSyncRequired",
          aggregateId: { in: unitIds },
        },
      }),
    );
    expect(rateEvents).toBe(5);
  });

  it("preview with template performs no writes", async () => {
    const beforeUnits = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({ where: { tenantId: TENANT, propertyId: PROP } }),
    );
    const beforePlans = await withTenantTransaction(TENANT, async (tx) =>
      tx.ratePlan.count({ where: { tenantId: TENANT } }),
    );

    const result = await useCase().execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 201, count: 3 },
        templateUnitId: TEMPLATE_UNIT,
        preview: true,
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().preview).toBe(true);
    expect(result.getValue().pricingTemplate?.baseNightlyAmount).toBe(
      "150.0000",
    );

    const afterUnits = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({ where: { tenantId: TENANT, propertyId: PROP } }),
    );
    const afterPlans = await withTenantTransaction(TENANT, async (tx) =>
      tx.ratePlan.count({ where: { tenantId: TENANT } }),
    );
    expect(afterUnits).toBe(beforeUnits);
    expect(afterPlans).toBe(beforePlans);
  });

  it("rejects wrong RoomType template and creates no units", async () => {
    const otherRt = randomUUID();
    const otherUnit = randomUUID();
    await roomTypeRepository.save(
      RoomType.create({
        id: otherRt,
        tenantId: TENANT,
        propertyId: PROP,
        name: "Suite",
        code: "STE",
        maxGuests: 4,
      }),
    );
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.unit.create({
        data: {
          id: otherUnit,
          tenantId: TENANT,
          propertyId: PROP,
          name: "Suite 300",
          slug: "suite-300",
          maxGuests: 4,
          roomNumber: "300",
          roomTypeId: otherRt,
          status: "active",
        },
      });
    });
    await ratePlanRepository.save(TENANT, otherUnit, {
      baseNightlyAmount: "300.0000",
      currency: "EUR",
      seasons: [],
      dowModifiers: [],
      losDiscounts: [],
    });

    const before = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({
        where: {
          tenantId: TENANT,
          propertyId: PROP,
          roomNumber: { in: ["401", "402"] },
        },
      }),
    );

    const result = await useCase().execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 401, count: 2 },
        templateUnitId: otherUnit,
      },
      admin,
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/RoomType/i);

    const after = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({
        where: {
          tenantId: TENANT,
          propertyId: PROP,
          roomNumber: { in: ["401", "402"] },
        },
      }),
    );
    expect(after).toBe(before);
  });

  it("rolls back units when rate plan write fails mid-batch", async () => {
    const beforeUnits = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({ where: { tenantId: TENANT, propertyId: PROP } }),
    );
    const beforePlans = await withTenantTransaction(TENANT, async (tx) =>
      tx.ratePlan.count({ where: { tenantId: TENANT } }),
    );

    let saves = 0;
    const flakyRates: typeof ratePlanRepository = {
      findByUnitId: (unitId, tenantId) =>
        ratePlanRepository.findByUnitId(unitId, tenantId),
      findByUnitIds: (unitIds, tenantId) =>
        ratePlanRepository.findByUnitIds(unitIds, tenantId),
      save: async (tenantId, unitId, plan) => {
        saves += 1;
        if (saves >= 2) {
          throw new Error("simulated rate plan failure");
        }
        await ratePlanRepository.save(tenantId, unitId, plan);
      },
    };

    const uc = new BulkCreateUnitsUseCase(
      propertyRepository,
      roomTypeRepository,
      permissionChecker,
      idGenerator,
      undefined,
      flakyRates,
      outbox,
    );

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 501, count: 3 },
        templateUnitId: TEMPLATE_UNIT,
      },
      admin,
    );

    expect(result.isFailure).toBe(true);

    const afterUnits = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({ where: { tenantId: TENANT, propertyId: PROP } }),
    );
    const afterPlans = await withTenantTransaction(TENANT, async (tx) =>
      tx.ratePlan.count({ where: { tenantId: TENANT } }),
    );
    const partialRooms = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.count({
        where: {
          tenantId: TENANT,
          roomNumber: { in: ["501", "502", "503"] },
        },
      }),
    );

    expect(afterUnits).toBe(beforeUnits);
    expect(afterPlans).toBe(beforePlans);
    expect(partialRooms).toBe(0);
  });
});

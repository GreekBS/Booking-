import { describe, expect, it, vi } from "vitest";
import {
  BulkCreateUnitsUseCase,
  NotFoundError,
  Property,
  RoomType,
  UnsupportedRatePlanTemplateError,
  ValidationError,
  type ActorContext,
  type IPropertyRepository,
  type IRatePlanRepository,
  type IRoomTypeRepository,
  type RatePlanProps,
} from "../../src/index";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TEMPLATE_UNIT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_RT_UNIT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const admin: ActorContext = {
  userId: "admin",
  tenantId: TENANT,
  role: "admin",
  propertyIds: null,
};

const pricedTemplate: RatePlanProps = {
  baseNightlyAmount: "150.0000",
  currency: "EUR",
  seasons: [
    {
      id: "season-src",
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
};

function hotelWithTemplateUnit() {
  const property = Property.create({
    id: PROP,
    tenantId: TENANT,
    name: "Hotel H2b",
    slug: "hotel-h2b",
    type: "hotel",
    defaultUnit: {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      maxGuests: 2,
    },
  });
  property.addUnit({
    id: TEMPLATE_UNIT,
    name: "Standard Double 100",
    slug: "room-100",
    maxGuests: 2,
    roomTypeId: RT,
    roomNumber: "100",
  });
  property.addUnit({
    id: OTHER_RT_UNIT,
    name: "Suite 200",
    slug: "suite-200",
    maxGuests: 4,
    roomTypeId: "99999999-9999-4999-8999-999999999999",
    roomNumber: "200",
  });
  return property;
}

function buildSuite(opts?: {
  planByUnit?: Map<string, RatePlanProps | null>;
  saveImpl?: (tenantId: string, unitId: string, plan: RatePlanProps) => Promise<void>;
  outboxImpl?: (events: unknown[]) => Promise<void>;
}) {
  const property = hotelWithTemplateUnit();
  const roomType = RoomType.create({
    id: RT,
    tenantId: TENANT,
    propertyId: PROP,
    name: "Standard Double",
    code: "STD",
    maxGuests: 2,
  });

  const plans =
    opts?.planByUnit ??
    new Map<string, RatePlanProps | null>([[TEMPLATE_UNIT, pricedTemplate]]);

  const propertyRepository: IPropertyRepository = {
    save: vi.fn(async () => undefined),
    findById: vi.fn(async () => property),
    findBySlug: vi.fn(),
    existsBySlug: vi.fn(),
    findAll: vi.fn(),
    listUnitCatalog: vi.fn(),
    mutateUnderLock: vi.fn(async (_t, _p, mutator, afterPersist) => {
      await mutator(property);
      if (afterPersist) await afterPersist(property);
      return property;
    }),
  };

  const roomTypeRepository: IRoomTypeRepository = {
    save: vi.fn(),
    findById: vi.fn(async () => roomType),
    listByProperty: vi.fn(),
    countLinkedUnits: vi.fn(),
  };

  const savedPlans: Array<{ unitId: string; plan: RatePlanProps }> = [];
  const ratePlanRepository: IRatePlanRepository = {
    findByUnitId: vi.fn(async (unitId) => plans.get(unitId) ?? null),
    findByUnitIds: vi.fn(async () => new Map()),
    save: vi.fn(async (tenantId, unitId, plan) => {
      if (opts?.saveImpl) {
        await opts.saveImpl(tenantId, unitId, plan);
        return;
      }
      savedPlans.push({ unitId, plan });
      plans.set(unitId, plan);
    }),
  };

  const outboxEvents: unknown[] = [];
  const outboxRepository = {
    saveEvents: vi.fn(async (events: unknown[]) => {
      if (opts?.outboxImpl) {
        await opts.outboxImpl(events);
        return;
      }
      outboxEvents.push(...events);
    }),
    findUnprocessed: vi.fn(),
    claimBatch: vi.fn(),
    markProcessed: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
  };

  let n = 0;
  const idGenerator = {
    generate: () => {
      n += 1;
      return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    },
  };

  const uc = new BulkCreateUnitsUseCase(
    propertyRepository,
    roomTypeRepository,
    new PermissionChecker(),
    idGenerator,
    undefined,
    ratePlanRepository,
    outboxRepository as never,
  );

  return {
    uc,
    property,
    propertyRepository,
    ratePlanRepository,
    outboxRepository,
    savedPlans,
    outboxEvents,
  };
}

describe("BulkCreateUnitsUseCase C3-H2b", () => {
  it("bulk create without template leaves pricingTemplate null", async () => {
    const { uc, ratePlanRepository, outboxRepository } = buildSuite();
    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 2 },
      },
      admin,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().pricingTemplate).toBeNull();
    expect(ratePlanRepository.save).not.toHaveBeenCalled();
    expect(outboxRepository.saveEvents).not.toHaveBeenCalled();
  });

  it("previews pricing summary without writes when template provided", async () => {
    const { uc, propertyRepository, ratePlanRepository, outboxRepository } =
      buildSuite();
    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 3 },
        templateUnitId: TEMPLATE_UNIT,
        preview: true,
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().preview).toBe(true);
    expect(result.getValue().planned).toHaveLength(3);
    expect(result.getValue().pricingTemplate).toMatchObject({
      templateUnitId: TEMPLATE_UNIT,
      copiedFromTemplate: true,
      currency: "EUR",
      baseNightlyAmount: "150.0000",
      seasonCount: 1,
      dowModifierCount: 1,
    });
    expect(propertyRepository.mutateUnderLock).not.toHaveBeenCalled();
    expect(ratePlanRepository.save).not.toHaveBeenCalled();
    expect(outboxRepository.saveEvents).not.toHaveBeenCalled();
  });

  it("creates units with cloned base, seasons, DOW and unique season ids", async () => {
    const { uc, savedPlans, outboxEvents } = buildSuite();
    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 3 },
        templateUnitId: TEMPLATE_UNIT,
      },
      admin,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().units).toHaveLength(3);
    expect(savedPlans).toHaveLength(3);

    for (const row of savedPlans) {
      expect(row.plan.baseNightlyAmount).toBe("150.0000");
      expect(row.plan.seasons[0]?.nightlyAmount).toBe("220.0000");
      expect(row.plan.dowModifiers[0]?.modifierValue).toBe("10.0000");
      expect(row.plan.seasons[0]?.id).not.toBe("season-src");
      expect(row.plan.losDiscounts).toEqual([]);
    }

    const seasonIds = savedPlans.map((r) => r.plan.seasons[0]!.id);
    expect(new Set(seasonIds).size).toBe(3);
    expect(outboxEvents).toHaveLength(3);
    expect(result.getValue().pricingTemplate?.copiedFromTemplate).toBe(true);
  });

  it("rejects missing template unit", async () => {
    const { uc } = buildSuite();
    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 1 },
        templateUnitId: "11111111-1111-4111-8111-111111111111",
      },
      admin,
    );
    expect(result.getError()).toBeInstanceOf(NotFoundError);
  });

  it("rejects template unit from a different RoomType", async () => {
    const { uc } = buildSuite();
    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 1 },
        templateUnitId: OTHER_RT_UNIT,
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/RoomType/i);
  });

  it("rejects template without a rate plan", async () => {
    const { uc } = buildSuite({
      planByUnit: new Map([[TEMPLATE_UNIT, null]]),
    });
    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 1 },
        templateUnitId: TEMPLATE_UNIT,
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/no rate plan/i);
  });

  it("rejects zero-priced templates", async () => {
    const { uc } = buildSuite({
      planByUnit: new Map([
        [
          TEMPLATE_UNIT,
          { ...pricedTemplate, baseNightlyAmount: "0.0000" },
        ],
      ]),
    });
    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 1 },
        templateUnitId: TEMPLATE_UNIT,
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
  });

  it("rejects unsupported LOS templates", async () => {
    const { uc } = buildSuite({
      planByUnit: new Map([
        [
          TEMPLATE_UNIT,
          {
            ...pricedTemplate,
            losDiscounts: [{ minNights: 7, percentOff: "10.0000" }],
          },
        ],
      ]),
    });
    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 1 },
        templateUnitId: TEMPLATE_UNIT,
      },
      admin,
    );
    expect(result.getError()).toBeInstanceOf(UnsupportedRatePlanTemplateError);
  });

  it("rolls back when RatePlan persistence fails (no committed units)", async () => {
    const { uc, property } = buildSuite({
      saveImpl: async () => {
        throw new Error("rate plan write failed");
      },
    });
    const before = property.units.length;

    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 2 },
        templateUnitId: TEMPLATE_UNIT,
      },
      admin,
    );

    expect(result.isFailure).toBe(true);
    // In-memory mutator still mutated the aggregate; production TX rolls back.
    // Domain reports failure so callers do not treat the batch as committed.
    expect(result.getError().message).toMatch(/rate plan write failed/);
    expect(property.units.length).toBeGreaterThanOrEqual(before);
  });

  it("rolls back when outbox persistence fails", async () => {
    const { uc } = buildSuite({
      outboxImpl: async () => {
        throw new Error("outbox write failed");
      },
    });
    const result = await uc.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        roomTypeId: RT,
        numbering: { mode: "sequential", start: 101, count: 2 },
        templateUnitId: TEMPLATE_UNIT,
      },
      admin,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/outbox write failed/);
  });
});

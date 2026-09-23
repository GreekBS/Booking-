import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GetUnitsCalendarBatchUseCase,
  GetUnitsRatePlansBatchUseCase,
  GetUnitsAvailabilityRulesBatchUseCase,
} from "../src/commerce/application/BatchCalendarReadUseCases";
import { PermissionChecker } from "../src/shared/services/PermissionChecker";
import { ForbiddenError, ValidationError } from "../src/shared/errors/DomainError";
import { Hold } from "../src/commerce/booking/domain/Hold";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UNIT_A1 = "11111111-1111-4111-8111-111111111111";
const UNIT_A2 = "22222222-2222-4222-8222-222222222222";
const UNIT_B1 = "33333333-3333-4333-8333-333333333333";
const PROP_A = "44444444-4444-4444-8444-444444444444";
const PROP_B = "55555555-5555-4555-8555-555555555555";

function makeHold(unitId: string, propertyId: string, checkIn: string, checkOut: string) {
  return Hold.create({
    id: `hold-${unitId}-${checkIn}`,
    tenantId: TENANT_A,
    unitId,
    propertyId,
    checkIn,
    checkOut,
    guestCount: 2,
    now: new Date("2026-06-01T12:00:00.000Z"),
  });
}

describe("Batch calendar read use cases", () => {
  const permissionChecker = new PermissionChecker();
  const adminActor = {
    userId: "admin-1",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  const getUnitPropertyContextsByUnitIds = vi.fn();
  const catalog = {
    getUnit: vi.fn(),
    getProperty: vi.fn(),
    getUnitsByIds: vi.fn(),
    getPropertiesByIds: vi.fn(),
    getUnitPropertyContextsByUnitIds,
  };

  const findCalendarBlocksByUnits = vi.fn();
  const findActiveByUnits = vi.fn();
  const findByUnits = vi.fn();
  const findByUnitIdsRates = vi.fn();
  const findByUnitIdsRules = vi.fn();

  beforeEach(() => {
    getUnitPropertyContextsByUnitIds.mockReset();
    findCalendarBlocksByUnits.mockReset();
    findActiveByUnits.mockReset();
    findByUnits.mockReset();
    findByUnitIdsRates.mockReset();
    findByUnitIdsRules.mockReset();

    getUnitPropertyContextsByUnitIds.mockImplementation(async (ids: string[]) =>
      ids
        .filter((id) => id === UNIT_A1 || id === UNIT_A2)
        .map((id) => ({
          unitId: id,
          propertyId: PROP_A,
        })),
    );
    findCalendarBlocksByUnits.mockResolvedValue([]);
    findActiveByUnits.mockResolvedValue([]);
    findByUnits.mockResolvedValue([]);
    findByUnitIdsRates.mockResolvedValue(new Map());
    findByUnitIdsRules.mockResolvedValue(new Map());
  });

  describe("GetUnitsCalendarBatchUseCase", () => {
    const useCase = new GetUnitsCalendarBatchUseCase(
      catalog as never,
      { findCalendarBlocksByUnits } as never,
      { findActiveByUnits } as never,
      { findByUnits } as never,
      permissionChecker,
    );

    it("returns empty calendars per unit and uses batched parallel queries once", async () => {
      const result = await useCase.execute(
        {
          tenantId: TENANT_A,
          unitIds: [UNIT_A1, UNIT_A2],
          from: "2026-06-01",
          to: "2026-09-01",
        },
        adminActor,
      );

      expect(result.isSuccess).toBe(true);
      const value = result.getValue();
      expect(Object.keys(value).sort()).toEqual([UNIT_A1, UNIT_A2].sort());
      expect(value[UNIT_A1]).toEqual({ blocks: [], holds: [], bookings: [] });
      expect(findCalendarBlocksByUnits).toHaveBeenCalledTimes(1);
      expect(findActiveByUnits).toHaveBeenCalledTimes(1);
      expect(findByUnits).toHaveBeenCalledTimes(1);
      expect(findCalendarBlocksByUnits).toHaveBeenCalledWith(
        expect.arrayContaining([UNIT_A1, UNIT_A2]),
        TENANT_A,
        { from: "2026-06-01", to: "2026-09-01" },
      );
    });

    it("groups blocks, holds, and bookings by unit with calendar semantics", async () => {
      findCalendarBlocksByUnits.mockResolvedValue([
        {
          id: "blk-1",
          unitId: UNIT_A1,
          blockType: "manual",
          status: "active",
          checkIn: "2026-06-10",
          checkOut: "2026-06-12",
          sourceId: null,
          reason: "owner",
          expiresAt: null,
        },
        {
          id: "blk-2",
          unitId: UNIT_A2,
          blockType: "channel_import",
          status: "active",
          checkIn: "2026-06-15",
          checkOut: "2026-06-18",
          sourceId: "ext-1",
          reason: null,
          expiresAt: null,
        },
      ]);
      findActiveByUnits.mockResolvedValue([
        makeHold(UNIT_A1, PROP_A, "2026-06-20", "2026-06-22"),
      ]);

      const result = await useCase.execute(
        {
          tenantId: TENANT_A,
          unitIds: [UNIT_A1, UNIT_A2],
          from: "2026-06-01",
          to: "2026-07-01",
        },
        adminActor,
      );

      const value = result.getValue();
      expect(value[UNIT_A1]!.blocks).toHaveLength(1);
      expect(value[UNIT_A1]!.blocks[0]!.blockType).toBe("manual");
      expect(value[UNIT_A1]!.holds).toHaveLength(1);
      expect(value[UNIT_A1]!.holds[0]!.checkIn).toBe("2026-06-20");
      expect(value[UNIT_A2]!.blocks[0]!.blockType).toBe("channel_import");
      expect(value[UNIT_A2]!.holds).toEqual([]);
    });

    it("fails safely when a foreign unit id is mixed in (no leak)", async () => {
      getUnitPropertyContextsByUnitIds.mockResolvedValue([
        { unitId: UNIT_A1, propertyId: PROP_A },
        // UNIT_B1 omitted — not in tenant A
      ]);

      const result = await useCase.execute(
        {
          tenantId: TENANT_A,
          unitIds: [UNIT_A1, UNIT_B1],
          from: "2026-06-01",
          to: "2026-07-01",
        },
        adminActor,
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ValidationError);
      expect(result.getError().message).toBe("One or more units were not found");
      expect(findCalendarBlocksByUnits).not.toHaveBeenCalled();
    });

    it("forbids manager outside assigned properties", async () => {
      const result = await useCase.execute(
        {
          tenantId: TENANT_A,
          unitIds: [UNIT_A1],
          from: "2026-06-01",
          to: "2026-07-01",
        },
        {
          userId: "mgr",
          role: "manager",
          propertyIds: [PROP_B],
          isSuperAdmin: false,
        },
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ForbiddenError);
      expect(findByUnits).not.toHaveBeenCalled();
    });

    it("allows inactive units for operator calendar reads (reaches batched DB queries)", async () => {
      getUnitPropertyContextsByUnitIds.mockResolvedValue([
        { unitId: UNIT_A1, propertyId: PROP_A },
      ]);
      findCalendarBlocksByUnits.mockResolvedValue([
        {
          id: "blk-inactive",
          unitId: UNIT_A1,
          blockType: "manual",
          status: "active",
          checkIn: "2026-06-01",
          checkOut: "2026-06-03",
          sourceId: null,
          reason: null,
          expiresAt: null,
        },
      ]);

      const result = await useCase.execute(
        {
          tenantId: TENANT_A,
          unitIds: [UNIT_A1],
          from: "2026-06-01",
          to: "2026-07-01",
        },
        adminActor,
      );

      expect(result.isSuccess).toBe(true);
      expect(findCalendarBlocksByUnits).toHaveBeenCalledTimes(1);
      expect(result.getValue()[UNIT_A1]!.blocks).toHaveLength(1);
    });

    it("uses one-shot unit+property context (not serial getUnitsByIds → getPropertiesByIds)", async () => {
      await useCase.execute(
        {
          tenantId: TENANT_A,
          unitIds: [UNIT_A1, UNIT_A2],
          from: "2026-06-01",
          to: "2026-07-01",
        },
        adminActor,
      );

      expect(getUnitPropertyContextsByUnitIds).toHaveBeenCalledTimes(1);
      expect(catalog.getUnitsByIds).not.toHaveBeenCalled();
      expect(catalog.getPropertiesByIds).not.toHaveBeenCalled();
    });

    it("does not call per-unit repository methods", async () => {
      const findCalendarBlocks = vi.fn();
      const findActiveByUnit = vi.fn();
      const findByUnit = vi.fn();
      const uc = new GetUnitsCalendarBatchUseCase(
        catalog as never,
        { findCalendarBlocksByUnits, findCalendarBlocks } as never,
        { findActiveByUnits, findActiveByUnit } as never,
        { findByUnits, findByUnit } as never,
        permissionChecker,
      );

      await uc.execute(
        {
          tenantId: TENANT_A,
          unitIds: [UNIT_A1, UNIT_A2],
          from: "2026-06-01",
          to: "2026-07-01",
        },
        adminActor,
      );

      expect(findCalendarBlocks).not.toHaveBeenCalled();
      expect(findActiveByUnit).not.toHaveBeenCalled();
      expect(findByUnit).not.toHaveBeenCalled();
    });
  });

  describe("GetUnitsRatePlansBatchUseCase", () => {
    const useCase = new GetUnitsRatePlansBatchUseCase(
      catalog as never,
      { findByUnitIds: findByUnitIdsRates } as never,
      permissionChecker,
    );

    it("returns null for units without plans via one batch query", async () => {
      findByUnitIdsRates.mockResolvedValue(
        new Map([
          [
            UNIT_A1,
            {
              baseNightlyAmount: "120.0000",
              currency: "EUR",
              seasons: [],
              dowModifiers: [],
              losDiscounts: [],
            },
          ],
        ]),
      );

      const result = await useCase.execute(
        { tenantId: TENANT_A, unitIds: [UNIT_A1, UNIT_A2] },
        adminActor,
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()[UNIT_A1]?.baseNightlyAmount).toBe("120.0000");
      expect(result.getValue()[UNIT_A2]).toBeNull();
      expect(findByUnitIdsRates).toHaveBeenCalledTimes(1);
    });

    it("allows inactive units for operator rate-plan batch reads", async () => {
      getUnitPropertyContextsByUnitIds.mockResolvedValue([
        { unitId: UNIT_A1, propertyId: PROP_A },
      ]);
      findByUnitIdsRates.mockResolvedValue(
        new Map([
          [
            UNIT_A1,
            {
              baseNightlyAmount: "99.0000",
              currency: "EUR",
              seasons: [],
              dowModifiers: [],
              losDiscounts: [],
            },
          ],
        ]),
      );

      const result = await useCase.execute(
        { tenantId: TENANT_A, unitIds: [UNIT_A1] },
        adminActor,
      );

      expect(result.isSuccess).toBe(true);
      expect(findByUnitIdsRates).toHaveBeenCalledTimes(1);
      expect(result.getValue()[UNIT_A1]?.baseNightlyAmount).toBe("99.0000");
    });
  });

  describe("GetUnitsAvailabilityRulesBatchUseCase", () => {
    const useCase = new GetUnitsAvailabilityRulesBatchUseCase(
      catalog as never,
      { findByUnitIds: findByUnitIdsRules } as never,
      permissionChecker,
    );

    it("applies DEFAULT_RULES when missing and preserves custom rules", async () => {
      findByUnitIdsRules.mockResolvedValue(
        new Map([
          [
            UNIT_A1,
            {
              minNights: 3,
              maxNights: 14,
              checkInDays: [5, 6],
              checkOutDays: [0],
              advanceMinDays: 1,
              advanceMaxDays: 180,
              turnoverNights: 1,
            },
          ],
        ]),
      );

      const result = await useCase.execute(
        { tenantId: TENANT_A, unitIds: [UNIT_A1, UNIT_A2] },
        adminActor,
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()[UNIT_A1]!.minNights).toBe(3);
      expect(result.getValue()[UNIT_A1]!.checkInDays).toEqual([5, 6]);
      expect(result.getValue()[UNIT_A2]!.minNights).toBe(1);
      expect(result.getValue()[UNIT_A2]!.maxNights).toBe(30);
      expect(findByUnitIdsRules).toHaveBeenCalledTimes(1);
    });
  });
});

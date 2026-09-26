import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CheckAvailabilityUseCase,
  CreateHoldUseCase,
  CreateBookingUseCase,
  ExpireHoldsUseCase,
  GetUnitCalendarUseCase,
} from "../src/commerce/application/CommerceUseCases";
import { ReservationOrchestrator } from "../src/commerce/reservation/ReservationOrchestrator";
import { PermissionChecker } from "../src/shared/services/PermissionChecker";
import { Hold } from "../src/commerce/booking/domain/Hold";
import { Quote } from "../src/commerce/booking/domain/Quote";
import { Booking } from "../src/commerce/booking/domain/Booking";
import { PricingCalculator } from "../src/commerce/pricing/PricingCalculator";

describe("CommerceUseCases", () => {
  const permissionChecker = new PermissionChecker();

  const adminActor = {
    userId: "admin-1",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  const managerActor = {
    userId: "manager-1",
    role: "manager" as const,
    propertyIds: ["other-property"],
    isSuperAdmin: false,
  };

  describe("CheckAvailabilityUseCase", () => {
    const catalog = {
      getUnit: vi.fn(),
      getProperty: vi.fn(),
    };
    const calendarBlocks = { findActiveBlocks: vi.fn().mockResolvedValue([]) };
    const availabilityRules = {
      findByUnitId: vi.fn().mockResolvedValue({
        minNights: 1,
        maxNights: 30,
        checkInDays: [0, 1, 2, 3, 4, 5, 6],
        checkOutDays: [0, 1, 2, 3, 4, 5, 6],
        advanceMinDays: 0,
        advanceMaxDays: 365,
        turnoverNights: 0,
      }),
    };
    const timezoneService = {
      propertyLocalToday: vi.fn().mockResolvedValue("2026-06-01"),
    };

    const orchestrator = new ReservationOrchestrator(
      catalog,
      calendarBlocks,
      availabilityRules,
      { findByUnitId: vi.fn() } as never,
      timezoneService,
      { generate: vi.fn() } as never,
    );

    const useCase = new CheckAvailabilityUseCase(catalog, orchestrator, permissionChecker);

    beforeEach(() => {
      catalog.getUnit.mockReset();
      catalog.getProperty.mockReset();
      catalog.getUnit.mockResolvedValue({
        id: "unit-1",
        tenantId: "tenant-1",
        propertyId: "property-1",
        maxGuests: 4,
        status: "active",
      });
      catalog.getProperty.mockResolvedValue({
        id: "property-1",
        tenantId: "tenant-1",
        timezone: "Europe/Athens",
        status: "active",
      });
    });

    it("returns availability for admin", async () => {
      const result = await useCase.execute(
        {
          tenantId: "tenant-1",
          unitId: "unit-1",
          checkIn: "2026-08-01",
          checkOut: "2026-08-05",
          guestCount: 2,
        },
        adminActor,
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().available).toBe(true);
    });

    it("denies manager without property assignment", async () => {
      const result = await useCase.execute(
        {
          tenantId: "tenant-1",
          unitId: "unit-1",
          checkIn: "2026-08-01",
          checkOut: "2026-08-05",
          guestCount: 2,
        },
        managerActor,
      );

      expect(result.isFailure).toBe(true);
    });
  });

  describe("CreateHoldUseCase", () => {
    const save = vi.fn();
    const catalog = {
      getUnit: vi.fn().mockResolvedValue({
        id: "unit-1",
        tenantId: "tenant-1",
        propertyId: "property-1",
        maxGuests: 4,
        status: "active",
      }),
      getProperty: vi.fn().mockResolvedValue({
        id: "property-1",
        tenantId: "tenant-1",
        timezone: "Europe/Athens",
        status: "active",
      }),
    };

    const orchestrator = new ReservationOrchestrator(
      catalog,
      { findActiveBlocks: vi.fn().mockResolvedValue([]) } as never,
      {
        findByUnitId: vi.fn().mockResolvedValue({
          minNights: 1,
          maxNights: 30,
          checkInDays: [0, 1, 2, 3, 4, 5, 6],
          checkOutDays: [0, 1, 2, 3, 4, 5, 6],
          advanceMinDays: 0,
          advanceMaxDays: 365,
          turnoverNights: 0,
        }),
      } as never,
      { findByUnitId: vi.fn() } as never,
      { propertyLocalToday: vi.fn().mockResolvedValue("2026-06-01") } as never,
      { generate: vi.fn().mockReturnValue("hold-1") } as never,
    );

    const useCase = new CreateHoldUseCase(
      { save, findById: vi.fn() } as never,
      orchestrator,
      permissionChecker,
      { generate: vi.fn().mockReturnValue("hold-1") } as never,
    );

    beforeEach(() => {
      save.mockReset();
    });

    it("creates hold for admin", async () => {
      const result = await useCase.execute(
        {
          tenantId: "tenant-1",
          unitId: "unit-1",
          checkIn: "2026-08-01",
          checkOut: "2026-08-05",
          guestCount: 2,
        },
        adminActor,
      );

      expect(result.isSuccess).toBe(true);
      expect(save).toHaveBeenCalledOnce();
    });

    it("denies manager", async () => {
      const result = await useCase.execute(
        {
          tenantId: "tenant-1",
          unitId: "unit-1",
          checkIn: "2026-08-01",
          checkOut: "2026-08-05",
          guestCount: 2,
        },
        managerActor,
      );

      expect(result.isFailure).toBe(true);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe("CreateBookingUseCase", () => {
    const saveHoldAndBooking = vi.fn();
    const append = vi.fn();
    const runInTenantTransaction = vi.fn(async (_tenantId: string, fn: () => Promise<unknown>) =>
      fn(),
    );
    const resolveGuest = {
      executeForBookingCreate: vi.fn().mockResolvedValue({
        isFailure: false,
        getValue: () => ({
          guest: { id: "guest-1" },
          outcome: "CREATED",
          createdDueToAmbiguity: false,
        }),
      }),
    };
    const guestRepository = {
      findById: vi.fn(),
    };

    const now = new Date();
    const hold = Hold.create({
      id: "hold-1",
      tenantId: "tenant-1",
      unitId: "unit-1",
      propertyId: "property-1",
      checkIn: "2026-08-01",
      checkOut: "2026-08-05",
      guestCount: 2,
      ttlSeconds: 3600,
      now,
    });

    const pricing = new PricingCalculator().calculate(
      {
        baseNightlyAmount: "100.0000",
        currency: "EUR",
        seasons: [],
        dowModifiers: [],
        losDiscounts: [],
      },
      hold.stayPeriod,
      now,
    );

    const quote = Quote.create({
      id: "quote-1",
      snapshotId: "snapshot-1",
      hold,
      pricing,
      propertyTimezone: "Europe/Athens",
    });

    const useCase = new CreateBookingUseCase(
      { findById: vi.fn().mockResolvedValue(hold) } as never,
      { findById: vi.fn().mockResolvedValue(quote) } as never,
      { saveHoldAndBooking, runInTenantTransaction } as never,
      permissionChecker,
      { append } as never,
      { generate: vi.fn().mockReturnValue("booking-1") } as never,
      resolveGuest as never,
      guestRepository as never,
    );

    beforeEach(() => {
      saveHoldAndBooking.mockReset();
      append.mockReset();
      runInTenantTransaction.mockClear();
      resolveGuest.executeForBookingCreate.mockClear();
    });

    it("creates booking transactionally with Guest link", async () => {
      const result = await useCase.execute(
        {
          tenantId: "tenant-1",
          quoteId: "quote-1",
          guest: { name: "Guest", email: "guest@test.com", phone: null },
        },
        adminActor,
      );

      expect(result.isSuccess).toBe(true);
      expect(runInTenantTransaction).toHaveBeenCalledOnce();
      expect(resolveGuest.executeForBookingCreate).toHaveBeenCalledOnce();
      expect(saveHoldAndBooking).toHaveBeenCalledOnce();
      expect(append).toHaveBeenCalledOnce();
      expect(result.getValue()).toBeInstanceOf(Booking);
      expect(result.getValue().guestId).toBe("guest-1");
    });

    it("rejects storefront-supplied guestId", async () => {
      const result = await useCase.execute(
        {
          tenantId: "tenant-1",
          quoteId: "quote-1",
          guest: { name: "Guest", email: "guest@test.com", phone: null },
          guestId: "guest-hijack",
        },
        {
          userId: "storefront:tenant-1",
          role: "admin",
          propertyIds: null,
          isSuperAdmin: false,
        },
      );

      expect(result.isFailure).toBe(true);
      expect(saveHoldAndBooking).not.toHaveBeenCalled();
    });
  });

  describe("ExpireHoldsUseCase", () => {
    it("expires holds past TTL", async () => {
      const expiredHold = Hold.create({
        id: "hold-expired",
        tenantId: "tenant-1",
        unitId: "unit-1",
        propertyId: "property-1",
        checkIn: "2026-08-01",
        checkOut: "2026-08-05",
        guestCount: 2,
        ttlSeconds: 1,
        now: new Date("2026-06-01T12:00:00.000Z"),
      });

      const save = vi.fn();
      const useCase = new ExpireHoldsUseCase({
        findExpiredActive: vi.fn().mockResolvedValue([expiredHold]),
        save,
      } as never);

      const result = await useCase.execute(new Date("2026-06-01T12:00:05.000Z"));

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().expired).toBe(1);
      expect(save).toHaveBeenCalledOnce();
    });
  });

  describe("GetUnitCalendarUseCase", () => {
    const catalog = {
      getUnit: vi.fn().mockResolvedValue({
        id: "unit-1",
        tenantId: "tenant-1",
        propertyId: "property-1",
        maxGuests: 4,
        status: "active",
      }),
      getProperty: vi.fn().mockResolvedValue({
        id: "property-1",
        tenantId: "tenant-1",
        timezone: "Europe/Athens",
        status: "active",
      }),
    };

    const useCase = new GetUnitCalendarUseCase(
      catalog,
      { findCalendarBlocks: vi.fn().mockResolvedValue([]) } as never,
      { findActiveByUnit: vi.fn().mockResolvedValue([]) } as never,
      { findByUnit: vi.fn().mockResolvedValue([]) } as never,
      permissionChecker,
    );

    it("returns calendar for assigned manager", async () => {
      const result = await useCase.execute(
        { tenantId: "tenant-1", unitId: "unit-1", from: "2025-06-01", to: "2025-06-30" },
        {
          userId: "manager-1",
          role: "manager",
          propertyIds: ["property-1"],
          isSuperAdmin: false,
        },
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().blocks).toEqual([]);
    });
  });
});

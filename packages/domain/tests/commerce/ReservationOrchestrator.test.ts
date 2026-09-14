import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReservationOrchestrator } from "../../src/commerce/reservation/ReservationOrchestrator";
import {
  villaProperty,
  defaultAvailabilityRules,
  baseRatePlan,
} from "./fixtures/commerceFixtures";

describe("ReservationOrchestrator.prepareReservationCreate", () => {
  const catalog = {
    getUnit: vi.fn(),
    getProperty: vi.fn(),
  };
  const calendarBlocks = { findActiveBlocks: vi.fn().mockResolvedValue([]) };
  const availabilityRules = {
    findByUnitId: vi.fn().mockResolvedValue(defaultAvailabilityRules),
  };
  const ratePlanRepository = {
    findByUnitId: vi.fn().mockResolvedValue(baseRatePlan),
  };
  const timezoneService = {
    propertyLocalToday: vi.fn().mockResolvedValue("2026-06-01"),
  };
  const idGenerator = { generate: vi.fn() };

  const orchestrator = new ReservationOrchestrator(
    catalog,
    calendarBlocks,
    availabilityRules,
    ratePlanRepository,
    timezoneService,
    idGenerator,
  );

  beforeEach(() => {
    catalog.getUnit.mockResolvedValue({
      id: villaProperty.units[0].id,
      tenantId: villaProperty.tenantId,
      propertyId: villaProperty.id,
      maxGuests: villaProperty.units[0].maxGuests,
      status: "active",
    });
    catalog.getProperty.mockResolvedValue({
      id: villaProperty.id,
      tenantId: villaProperty.tenantId,
      timezone: villaProperty.timezone,
      status: "active",
    });
  });

  it("prepares hold, quote, and booking from a normalized reservation command", async () => {
    const result = await orchestrator.prepareReservationCreate({
      reservation: {
        tenantId: villaProperty.tenantId,
        propertyId: villaProperty.id,
        unitId: villaProperty.units[0].id,
        checkIn: "2026-08-01",
        checkOut: "2026-08-05",
        guestCount: 2,
        guest: { name: "Channel Guest", email: "guest@example.com", phone: null },
        source: "booking_com",
        externalReference: { source: "booking_com", externalId: "ext-res-001" },
      },
      holdId: "hold-001",
      quoteId: "quote-001",
      snapshotId: "snapshot-001",
      bookingId: "booking-001",
      propertyTimezone: villaProperty.timezone,
      idempotencyKey: "channel:conn-1:ext-res-001",
    });

    expect(result.isSuccess).toBe(true);
    const prepared = result.getValue();
    expect(prepared.hold.id).toBe("hold-001");
    expect(prepared.hold.sessionRef).toBe("channel:conn-1:ext-res-001");
    expect(prepared.quote.id).toBe("quote-001");
    expect(prepared.booking.id).toBe("booking-001");
    expect(prepared.booking.status).toBe("pending");
    expect(prepared.booking.guest.name).toBe("Channel Guest");
    expect(prepared.hold.status).toBe("converted");
  });

  it("fails when availability is blocked", async () => {
    calendarBlocks.findActiveBlocks.mockResolvedValueOnce([
      {
        blockType: "manual",
        status: "active",
        checkIn: "2026-08-01",
        checkOut: "2026-08-05",
        sourceId: null,
      },
    ]);

    const result = await orchestrator.prepareReservationCreate({
      reservation: {
        tenantId: villaProperty.tenantId,
        propertyId: villaProperty.id,
        unitId: villaProperty.units[0].id,
        checkIn: "2026-08-01",
        checkOut: "2026-08-05",
        guestCount: 2,
        guest: { name: "Channel Guest", email: "guest@example.com", phone: null },
        source: "booking_com",
      },
      holdId: "hold-002",
      quoteId: "quote-002",
      snapshotId: "snapshot-002",
      bookingId: "booking-002",
      propertyTimezone: villaProperty.timezone,
    });

    expect(result.isFailure).toBe(true);
  });
});

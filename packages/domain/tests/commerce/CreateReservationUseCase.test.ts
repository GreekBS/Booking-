import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateReservationUseCase } from "../../src/commerce/application/CreateReservationUseCase";
import { PrepareReservationUseCase } from "../../src/commerce/application/PrepareReservationUseCase";
import { ImportNormalizedReservationAdapter } from "../../src/commerce/application/ImportNormalizedReservationAdapter";
import { createChannelImportActor } from "../../src/commerce/application/channelImportActor";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import { ReservationOrchestrator } from "../../src/commerce/reservation/ReservationOrchestrator";
import { Hold } from "../../src/commerce/booking/domain/Hold";
import { Booking } from "../../src/commerce/booking/domain/Booking";
import {
  villaProperty,
  defaultAvailabilityRules,
  baseRatePlan,
  createHoldForUnit,
  createQuoteForHold,
} from "./fixtures/commerceFixtures";

const TENANT_ID = villaProperty.tenantId;
const UNIT_ID = villaProperty.units[0].id;

function buildNormalizedReservation() {
  return {
    tenantId: TENANT_ID,
    propertyId: villaProperty.id,
    unitId: UNIT_ID,
    checkIn: "2026-08-01",
    checkOut: "2026-08-05",
    guestCount: 2,
    guest: { name: "Channel Guest", email: "channel@test.com", phone: null },
    source: "booking_com" as const,
    externalReference: { source: "booking_com" as const, externalId: "ext-res-001" },
  };
}

describe("PrepareReservationUseCase", () => {
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
  const idGenerator = {
    generate: vi
      .fn()
      .mockReturnValueOnce("hold-generated")
      .mockReturnValueOnce("quote-generated")
      .mockReturnValueOnce("snapshot-generated")
      .mockReturnValueOnce("booking-generated"),
  };

  const orchestrator = new ReservationOrchestrator(
    catalog,
    calendarBlocks,
    availabilityRules,
    ratePlanRepository,
    timezoneService,
    idGenerator,
  );

  const useCase = new PrepareReservationUseCase(
    catalog,
    orchestrator,
    new PermissionChecker(),
    idGenerator,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    catalog.getUnit.mockResolvedValue({
      id: UNIT_ID,
      tenantId: TENANT_ID,
      propertyId: villaProperty.id,
      maxGuests: 6,
      status: "active",
    });
    catalog.getProperty.mockResolvedValue({
      id: villaProperty.id,
      tenantId: TENANT_ID,
      timezone: villaProperty.timezone,
      status: "active",
    });
    idGenerator.generate
      .mockReturnValueOnce("hold-generated")
      .mockReturnValueOnce("quote-generated")
      .mockReturnValueOnce("snapshot-generated")
      .mockReturnValueOnce("booking-generated");
  });

  it("prepares hold, quote, and booking without persistence", async () => {
    const result = await useCase.prepare({
      reservation: buildNormalizedReservation(),
      profile: {
        confirmImmediately: true,
        idempotencyKey: "channel:conn-1:ext-res-001",
        actor: createChannelImportActor(TENANT_ID),
        writeAudit: false,
      },
    });

    expect(result.isSuccess).toBe(true);
    const prepared = result.getValue();
    expect(prepared.booking.status).toBe("confirmed");
    expect(prepared.hold.sessionRef).toBe("channel:conn-1:ext-res-001");
    expect(prepared.hold.status).toBe("converted");
  });
});

describe("CreateReservationUseCase", () => {
  const saveImportReservation = vi.fn();
  const runInTenantTransaction = vi.fn(async (_tenantId: string, fn: () => Promise<unknown>) =>
    fn(),
  );
  const prepareReservation = vi.fn();
  const auditLogRepository = { append: vi.fn() };
  const resolveOrCreateGuest = {
    executeForBookingCreate: vi.fn().mockResolvedValue({
      isFailure: false,
      getValue: () => ({
        guest: { id: "guest-channel-1" },
        outcome: "CREATED",
        createdDueToAmbiguity: false,
      }),
    }),
  };

  const useCase = new CreateReservationUseCase(
    { prepare: prepareReservation } as never,
    { saveImportReservation, runInTenantTransaction } as never,
    auditLogRepository as never,
    resolveOrCreateGuest as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    resolveOrCreateGuest.executeForBookingCreate.mockResolvedValue({
      isFailure: false,
      getValue: () => ({
        guest: { id: "guest-channel-1" },
        outcome: "CREATED",
        createdDueToAmbiguity: false,
      }),
    });
    const now = new Date();
    const hold = createHoldForUnit(UNIT_ID, villaProperty.id, "2026-08-01", "2026-08-05", {
      holdId: "hold-generated",
      now,
    });
    const quote = createQuoteForHold(hold, undefined, now);
    const booking = Booking.create({
      id: "booking-generated",
      hold,
      quote,
      guest: buildNormalizedReservation().guest,
      confirmationMode: "manual",
      now,
    });
    booking.confirm();

    prepareReservation.mockResolvedValue({
      isSuccess: true,
      getValue: () => ({ hold, quote, booking }),
    });
  });

  it("persists hold, quote, and booking atomically via saveImportReservation", async () => {
    const result = await useCase.execute({
      reservation: buildNormalizedReservation(),
      profile: {
        confirmImmediately: true,
        idempotencyKey: "channel:conn-1:ext-res-001",
        actor: createChannelImportActor(TENANT_ID),
        writeAudit: false,
      },
    });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().status).toBe("confirmed");
    expect(result.getValue().guestId).toBe("guest-channel-1");
    expect(prepareReservation).toHaveBeenCalledOnce();
    expect(runInTenantTransaction).toHaveBeenCalledOnce();
    expect(resolveOrCreateGuest.executeForBookingCreate).toHaveBeenCalledOnce();
    expect(saveImportReservation).toHaveBeenCalledOnce();
    expect(auditLogRepository.append).not.toHaveBeenCalled();
  });

  it("writes audit when profile requests it", async () => {
    const now = new Date();
    const hold = createHoldForUnit(UNIT_ID, villaProperty.id, "2026-08-01", "2026-08-05", { now });
    const quote = createQuoteForHold(hold, undefined, now);
    const booking = Booking.create({
      id: "booking-generated",
      hold,
      quote,
      guest: buildNormalizedReservation().guest,
      confirmationMode: "manual",
      now,
    });

    prepareReservation.mockResolvedValue({
      isSuccess: true,
      getValue: () => ({ hold, quote, booking }),
    });

    const result = await useCase.execute(
      {
        reservation: buildNormalizedReservation(),
        profile: {
          confirmImmediately: false,
          idempotencyKey: null,
          actor: {
            userId: "admin-1",
            role: "admin",
            propertyIds: null,
          },
          writeAudit: true,
        },
      },
      { ipAddress: "127.0.0.1" },
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().status).toBe("pending");
    expect(auditLogRepository.append).toHaveBeenCalledOnce();
  });

  it("does not persist when preparation fails", async () => {
    prepareReservation.mockResolvedValue({
      isSuccess: false,
      getError: () => new Error("Unavailable"),
    });

    const result = await useCase.execute({
      reservation: buildNormalizedReservation(),
      profile: {
        confirmImmediately: true,
        idempotencyKey: "channel:conn-1:ext-res-001",
        actor: createChannelImportActor(TENANT_ID),
        writeAudit: false,
      },
    });

    expect(result.isFailure).toBe(true);
    expect(saveImportReservation).not.toHaveBeenCalled();
    expect(resolveOrCreateGuest.executeForBookingCreate).not.toHaveBeenCalled();
  });
});

describe("ImportNormalizedReservationAdapter", () => {
  it("delegates to CreateReservationUseCase with channel profile", async () => {
    const now = new Date();
    const hold = Hold.create({
      id: "hold-1",
      tenantId: TENANT_ID,
      unitId: UNIT_ID,
      propertyId: villaProperty.id,
      checkIn: "2026-08-01",
      checkOut: "2026-08-05",
      guestCount: 2,
      now,
    });
    const quote = createQuoteForHold(hold, undefined, now);
    const booking = Booking.create({
      id: "booking-1",
      hold,
      quote,
      guest: buildNormalizedReservation().guest,
      confirmationMode: "manual",
      now,
    });
    booking.confirm();

    const execute = vi.fn().mockResolvedValue({
      isSuccess: true,
      getValue: () => booking,
    });
    const adapter = new ImportNormalizedReservationAdapter({ execute } as never);

    const reservation = buildNormalizedReservation();
    const result = await adapter.execute({
      reservation,
      channelImportKey: "channel:conn-1:ext-res-001",
    });

    expect(result.isSuccess).toBe(true);
    expect(execute).toHaveBeenCalledWith({
      reservation,
      profile: {
        confirmImmediately: true,
        idempotencyKey: "channel:conn-1:ext-res-001",
        actor: createChannelImportActor(TENANT_ID),
        writeAudit: false,
      },
    });
  });
});

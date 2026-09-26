import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  ChangeBookingStayUseCase,
  ConfirmBookingUseCase,
  CreateBookingUseCase,
  CreateHoldUseCase,
  CreateQuoteUseCase,
  PermissionChecker,
  ReservationOrchestrator,
  ResolveOrCreateGuest,
} from "@hcp/domain";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaAvailabilityRulesRepository } from "../../src/repositories/commerce/AvailabilityRulesRepository";
import { PrismaCommerceFlowRepository } from "../../src/repositories/commerce/CommerceFlowRepository";
import { PrismaGuestRepository } from "../../src/repositories/guests/GuestRepository";
import { PrismaCatalogQueryAdapter } from "../../src/adapters/CatalogQueryAdapter";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaAuditLogRepository } from "../../src/repositories/AuditLogRepository";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import { truncateIntegrationTables, prisma } from "./helpers";
import { seedCommerceFixture, seedAdditionalUnit } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";


function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

runIntegration("Booking stay change integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const calendarRepository = new PrismaCalendarBlockRepository();
  const ratePlanRepository = new PrismaRatePlanRepository();
  const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
  const commerceFlowRepository = new PrismaCommerceFlowRepository(outboxRepository);
  const catalogQueryAdapter = new PrismaCatalogQueryAdapter();
  const timezoneService = new TimezoneService();
  const permissionChecker = new PermissionChecker();
  const auditLogRepository = new PrismaAuditLogRepository();
  const idGenerator = new UuidIdGenerator();

  const adminActor = {
    userId: "550e8400-e29b-41d4-a716-446655442079",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  const tenantId = "550e8400-e29b-41d4-a716-446655442070";
  const propertyId = "550e8400-e29b-41d4-a716-446655442071";
  const unitId = "550e8400-e29b-41d4-a716-446655442072";
  const unitId2 = "550e8400-e29b-41d4-a716-446655442073";

  const reservationOrchestrator = new ReservationOrchestrator(
    catalogQueryAdapter,
    calendarRepository,
    availabilityRulesRepository,
    ratePlanRepository,
    timezoneService,
    idGenerator,
  );

  const createHoldUseCase = new CreateHoldUseCase(
    holdRepository,
    reservationOrchestrator,
    permissionChecker,
    idGenerator,
  );

  const createQuoteUseCase = new CreateQuoteUseCase(
    catalogQueryAdapter,
    holdRepository,
    quoteRepository,
    reservationOrchestrator,
    permissionChecker,
    idGenerator,
  );

  const createBookingUseCase = new CreateBookingUseCase(
    holdRepository,
    quoteRepository,
    commerceFlowRepository,
    permissionChecker,
    auditLogRepository,
    idGenerator,
    new ResolveOrCreateGuest(new PrismaGuestRepository(), idGenerator, permissionChecker),
    new PrismaGuestRepository(),
  );

  const confirmBookingUseCase = new ConfirmBookingUseCase(
    bookingRepository,
    permissionChecker,
    auditLogRepository,
  );

  const changeBookingStayUseCase = new ChangeBookingStayUseCase(
    bookingRepository,
    quoteRepository,
    commerceFlowRepository,
    reservationOrchestrator,
    permissionChecker,
    auditLogRepository,
  );

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId }, { adminUserId: adminActor.userId });
    await seedAdditionalUnit(tenantId, propertyId, unitId2);
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  async function createConfirmedBooking(params: {
    unitId?: string;
    checkIn: string;
    checkOut: string;
    guestName?: string;
  }) {
    const holdResult = await createHoldUseCase.execute(
      {
        tenantId,
        unitId: params.unitId ?? unitId,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        guestCount: 2,
      },
      adminActor,
    );
    expect(holdResult.isSuccess).toBe(true);
    const hold = holdResult.getValue();

    const quoteResult = await createQuoteUseCase.execute(
      { tenantId, holdId: hold.id },
      adminActor,
    );
    expect(quoteResult.isSuccess).toBe(true);
    const quote = quoteResult.getValue();

    const bookingResult = await createBookingUseCase.execute(
      {
        tenantId,
        quoteId: quote.id,
        guest: {
          name: params.guestName ?? "Stay Guest",
          email: "stay-guest@test.com",
          phone: null,
        },
        confirmationMode: "manual",
      },
      adminActor,
    );
    expect(bookingResult.isSuccess).toBe(true);
    const booking = bookingResult.getValue();

    const confirmResult = await confirmBookingUseCase.execute(
      { tenantId, bookingId: booking.id },
      adminActor,
    );
    expect(confirmResult.isSuccess).toBe(true);

    return {
      bookingId: booking.id,
      originalQuoteId: quote.id,
      holdId: hold.id,
    };
  }

  async function findBookingBlock(bookingId: string, targetUnitId = unitId) {
    return prisma.unitCalendarBlock.findFirst({
      where: {
        tenantId,
        unitId: targetUnitId,
        sourceId: bookingId,
        blockType: "booking",
        status: "active",
      },
    });
  }

  it("extends stay and updates booking, quote, and calendar block", async () => {
    const { bookingId, originalQuoteId } = await createConfirmedBooking({
      checkIn: "2027-01-05",
      checkOut: "2027-01-08",
    });

    const quoteCountBefore = await prisma.quote.count({ where: { tenantId } });

    const result = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId,
        unitId,
        checkIn: "2027-01-05",
        checkOut: "2027-01-12",
        guestCount: 2,
      },
      adminActor,
    );

    expect(result.isSuccess).toBe(true);
    const updatedBooking = result.getValue();

    expect(updatedBooking.stayPeriod.checkOut.value).toBe("2027-01-12");
    expect(updatedBooking.quoteId).not.toBe(originalQuoteId);

    const bookingRow = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(bookingRow).not.toBeNull();
    expect(toDateString(bookingRow!.checkOut)).toBe("2027-01-12");
    expect(bookingRow!.quoteId).toBe(updatedBooking.quoteId);

    expect(await prisma.quote.count({ where: { tenantId } })).toBe(quoteCountBefore + 1);
    expect(await prisma.quote.findUnique({ where: { id: originalQuoteId } })).not.toBeNull();
    expect(await prisma.quote.findUnique({ where: { id: updatedBooking.quoteId } })).not.toBeNull();

    const block = await findBookingBlock(bookingId);
    expect(block).not.toBeNull();
    expect(toDateString(block!.checkIn)).toBe("2027-01-05");
    expect(toDateString(block!.checkOut)).toBe("2027-01-12");
  });

  it("moves unit and updates booking unit and calendar block unit", async () => {
    const { bookingId } = await createConfirmedBooking({
      checkIn: "2027-02-01",
      checkOut: "2027-02-05",
    });

    const result = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId,
        unitId: unitId2,
        checkIn: "2027-02-01",
        checkOut: "2027-02-05",
        guestCount: 2,
      },
      adminActor,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().unitId).toBe(unitId2);

    const bookingRow = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(bookingRow!.unitId).toBe(unitId2);

    expect(await findBookingBlock(bookingId, unitId)).toBeNull();
    const movedBlock = await findBookingBlock(bookingId, unitId2);
    expect(movedBlock).not.toBeNull();
    expect(toDateString(movedBlock!.checkIn)).toBe("2027-02-01");
    expect(toDateString(movedBlock!.checkOut)).toBe("2027-02-05");
  });

  it("creates a new quote but no new hold on stay change", async () => {
    const { bookingId, holdId } = await createConfirmedBooking({
      checkIn: "2027-03-01",
      checkOut: "2027-03-04",
    });

    const holdCountBefore = await prisma.bookingHold.count({ where: { tenantId } });
    const quoteCountBefore = await prisma.quote.count({ where: { tenantId } });

    const result = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId,
        unitId,
        checkIn: "2027-03-01",
        checkOut: "2027-03-07",
        guestCount: 2,
      },
      adminActor,
    );

    expect(result.isSuccess).toBe(true);
    expect(await prisma.bookingHold.count({ where: { tenantId } })).toBe(holdCountBefore);
    expect(await prisma.quote.count({ where: { tenantId } })).toBe(quoteCountBefore + 1);

    const bookingRow = await prisma.booking.findUnique({ where: { id: bookingId } });
    expect(bookingRow!.holdId).toBe(holdId);
  });

  it("allows self-overlap via excludeSourceIds when extending stay", async () => {
    const { bookingId } = await createConfirmedBooking({
      checkIn: "2027-04-05",
      checkOut: "2027-04-08",
    });

    const result = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId,
        unitId,
        checkIn: "2027-04-05",
        checkOut: "2027-04-10",
        guestCount: 2,
      },
      adminActor,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().stayPeriod.checkOut.value).toBe("2027-04-10");

    const block = await findBookingBlock(bookingId);
    expect(block).not.toBeNull();
    expect(toDateString(block!.checkOut)).toBe("2027-04-10");
  });

  it("rejects real overlap with another booking", async () => {
    const bookingA = await createConfirmedBooking({
      checkIn: "2027-05-05",
      checkOut: "2027-05-08",
      guestName: "Guest A",
    });
    await createConfirmedBooking({
      checkIn: "2027-05-10",
      checkOut: "2027-05-13",
      guestName: "Guest B",
    });

    const bookingBefore = await prisma.booking.findUnique({ where: { id: bookingA.bookingId } });
    const blockBefore = await findBookingBlock(bookingA.bookingId);
    const quoteCountBefore = await prisma.quote.count({ where: { tenantId } });

    const result = await changeBookingStayUseCase.execute(
      {
        tenantId,
        bookingId: bookingA.bookingId,
        unitId,
        checkIn: "2027-05-05",
        checkOut: "2027-05-14",
        guestCount: 2,
      },
      adminActor,
    );

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/overlap|not available/i);

    const bookingAfter = await prisma.booking.findUnique({ where: { id: bookingA.bookingId } });
    expect(toDateString(bookingAfter!.checkOut)).toBe(toDateString(bookingBefore!.checkOut));
    expect(bookingAfter!.quoteId).toBe(bookingBefore!.quoteId);

    const blockAfter = await findBookingBlock(bookingA.bookingId);
    expect(toDateString(blockAfter!.checkOut)).toBe(toDateString(blockBefore!.checkOut));
    expect(await prisma.quote.count({ where: { tenantId } })).toBe(quoteCountBefore);
  });

  it("handles concurrent conflicting stay changes with one success and one conflict", async () => {
    const bookingA = await createConfirmedBooking({
      checkIn: "2027-06-05",
      checkOut: "2027-06-10",
      guestName: "Concurrent A",
    });
    const bookingB = await createConfirmedBooking({
      checkIn: "2027-06-15",
      checkOut: "2027-06-20",
      guestName: "Concurrent B",
    });

    const [resultA, resultB] = await Promise.all([
      changeBookingStayUseCase.execute(
        {
          tenantId,
          bookingId: bookingA.bookingId,
          unitId,
          checkIn: "2027-06-05",
          checkOut: "2027-06-15",
          guestCount: 2,
        },
        adminActor,
      ),
      changeBookingStayUseCase.execute(
        {
          tenantId,
          bookingId: bookingB.bookingId,
          unitId,
          checkIn: "2027-06-10",
          checkOut: "2027-06-20",
          guestCount: 2,
        },
        adminActor,
      ),
    ]);

    const outcomes = [resultA, resultB];
    const successes = outcomes.filter((result) => result.isSuccess);
    const failures = outcomes.filter((result) => result.isFailure);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.getError().message).toMatch(/Dates no longer available|overlap|not available/i);

    const winnerId = successes[0]!.getValue().id;
    const loserId = winnerId === bookingA.bookingId ? bookingB.bookingId : bookingA.bookingId;

    const loserRow = await prisma.booking.findUnique({ where: { id: loserId } });
    if (loserId === bookingA.bookingId) {
      expect(toDateString(loserRow!.checkOut)).toBe("2027-06-10");
    } else {
      expect(toDateString(loserRow!.checkIn)).toBe("2027-06-15");
    }
  });
});

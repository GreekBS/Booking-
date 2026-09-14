import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  CreateHoldUseCase,
  CreateQuoteUseCase,
  CreateBookingUseCase,
  ExpireHoldsUseCase,
  PermissionChecker,
  ReservationOrchestrator,
} from "@hcp/domain";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaAvailabilityRulesRepository } from "../../src/repositories/commerce/AvailabilityRulesRepository";
import { PrismaCommerceFlowRepository } from "../../src/repositories/commerce/CommerceFlowRepository";
import { PrismaCatalogQueryAdapter } from "../../src/adapters/CatalogQueryAdapter";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaAuditLogRepository } from "../../src/repositories/AuditLogRepository";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import {
  truncateIntegrationTables,
  countOutboxForAggregate,
  prisma,
} from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

runIntegration("Commerce flow integration", () => {
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
    userId: "550e8400-e29b-41d4-a716-446655442099",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  const tenantId = "550e8400-e29b-41d4-a716-446655442050";
  const propertyId = "550e8400-e29b-41d4-a716-446655442051";
  const unitId = "550e8400-e29b-41d4-a716-446655442052";

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
  );

  const expireHoldsUseCase = new ExpireHoldsUseCase(holdRepository);

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture(
      { tenantId, propertyId, unitId },
      { adminUserId: adminActor.userId },
    );
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("completes hold → quote → booking flow", async () => {
    const holdResult = await createHoldUseCase.execute(
      {
        tenantId,
        unitId,
        checkIn: "2027-02-01",
        checkOut: "2027-02-05",
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
        guest: { name: "Flow Guest", email: "flow@test.com", phone: null },
        confirmationMode: "manual",
      },
      adminActor,
    );

    expect(bookingResult.isSuccess).toBe(true);
    const booking = bookingResult.getValue();

    const loadedHold = await holdRepository.findById(hold.id, tenantId);
    expect(loadedHold?.status).toBe("converted");

    const loadedBooking = await bookingRepository.findById(booking.id, tenantId);
    expect(loadedBooking?.status).toBe("pending");

    const blocks = await calendarRepository.findActiveBlocks(unitId, tenantId);
    expect(blocks.filter((block) => block.blockType === "booking")).toHaveLength(1);
    expect(blocks.filter((block) => block.blockType === "hold")).toHaveLength(0);

    expect(await countOutboxForAggregate(booking.id)).toBeGreaterThan(0);
  });

  it("expires stale holds and releases calendar blocks", async () => {
    const holdResult = await createHoldUseCase.execute(
      {
        tenantId,
        unitId,
        checkIn: "2027-03-01",
        checkOut: "2027-03-04",
        guestCount: 2,
      },
      adminActor,
    );

    expect(holdResult.isSuccess).toBe(true);
    const holdId = holdResult.getValue().id;

    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { expiresAt: new Date("2026-01-01T00:00:00.000Z") },
    });

    const expireResult = await expireHoldsUseCase.execute(
      new Date("2026-06-01T12:00:00.000Z"),
      10,
    );

    expect(expireResult.isSuccess).toBe(true);
    expect(expireResult.getValue().expired).toBeGreaterThan(0);

    const loadedHold = await holdRepository.findById(holdId, tenantId);
    expect(loadedHold?.status).toBe("expired");

    const blocks = await calendarRepository.findActiveBlocks(unitId, tenantId);
    expect(blocks).toHaveLength(0);
  });
});

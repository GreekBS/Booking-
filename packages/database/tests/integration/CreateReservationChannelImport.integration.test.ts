import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  CreateReservationUseCase,
  ChannelImportKey,
  ImportNormalizedReservationAdapter,
  PermissionChecker,
  PrepareReservationUseCase,
  ReservationOrchestrator,
  ResolveOrCreateGuest,
} from "@hcp/domain";
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
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import {
  truncateIntegrationTables,
  countOutboxForAggregate,
  prisma,
} from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";


runIntegration("CreateReservation channel import integration", () => {
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

  const tenantId = "550e8400-e29b-41d4-a716-446655442060";
  const propertyId = "550e8400-e29b-41d4-a716-446655442061";
  const unitId = "550e8400-e29b-41d4-a716-446655442062";
  const connectionId = "550e8400-e29b-41d4-a716-446655442063";
  const externalReservationId = "ota-res-001";
  const channelImportKey = ChannelImportKey.create(connectionId, externalReservationId).value;

  const reservationOrchestrator = new ReservationOrchestrator(
    catalogQueryAdapter,
    calendarRepository,
    availabilityRulesRepository,
    ratePlanRepository,
    timezoneService,
    idGenerator,
  );

  const prepareReservationUseCase = new PrepareReservationUseCase(
    catalogQueryAdapter,
    reservationOrchestrator,
    permissionChecker,
    idGenerator,
  );

  const createReservationUseCase = new CreateReservationUseCase(
    prepareReservationUseCase,
    commerceFlowRepository,
    auditLogRepository,
    new ResolveOrCreateGuest(new PrismaGuestRepository(), idGenerator, permissionChecker),
  );

  const importNormalizedReservationPort = new ImportNormalizedReservationAdapter(
    createReservationUseCase,
  );

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("creates a confirmed booking with hold, quote, and calendar block via channel port", async () => {
    const result = await importNormalizedReservationPort.execute({
      reservation: {
        tenantId,
        propertyId,
        unitId,
        checkIn: "2027-04-01",
        checkOut: "2027-04-05",
        guestCount: 2,
        guest: { name: "OTA Guest", email: "ota@test.com", phone: null },
        source: "booking_com",
        externalReference: { source: "booking_com", externalId: externalReservationId },
      },
      channelImportKey,
    });

    expect(result.isSuccess).toBe(true);
    const booking = result.getValue();
    expect(booking.status).toBe("confirmed");
    expect(booking.guest.name).toBe("OTA Guest");

    const loadedBooking = await bookingRepository.findById(booking.id, tenantId);
    expect(loadedBooking?.status).toBe("confirmed");

    const holds = await holdRepository.findActiveByUnit(unitId, tenantId);
    expect(holds).toHaveLength(0);

    const persistedHold = await prisma.bookingHold.findFirst({
      where: { tenantId, unitId, status: "converted" },
    });
    expect(persistedHold).not.toBeNull();
    expect(persistedHold?.idempotencyKey).toBe(channelImportKey);

    const quoteCount = await prisma.quote.count({ where: { tenantId, holdId: persistedHold!.id } });
    expect(quoteCount).toBe(1);

    const blocks = await calendarRepository.findActiveBlocks(unitId, tenantId);
    expect(blocks.filter((block) => block.blockType === "booking")).toHaveLength(1);
    expect(blocks.filter((block) => block.blockType === "hold")).toHaveLength(0);

    expect(await countOutboxForAggregate(booking.id)).toBeGreaterThan(0);
  });

  it("does not write audit logs for channel import profile", async () => {
    const result = await importNormalizedReservationPort.execute({
      reservation: {
        tenantId,
        propertyId,
        unitId,
        checkIn: "2027-05-01",
        checkOut: "2027-05-04",
        guestCount: 2,
        guest: { name: "OTA Guest 2", email: "ota2@test.com", phone: null },
        source: "airbnb",
      },
      channelImportKey: ChannelImportKey.create(connectionId, "ota-res-002").value,
    });

    expect(result.isSuccess).toBe(true);

    const auditCount = await prisma.auditLog.count({
      where: {
        tenantId,
        resourceType: "Booking",
        resourceId: result.getValue().id,
      },
    });
    expect(auditCount).toBe(0);
  });
});

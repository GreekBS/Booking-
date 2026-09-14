import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  CreateHoldUseCase,
  LoggingHandler,
  OutboxHandlerRegistry,
  PermissionChecker,
  ProcessOutboxBatchUseCase,
  ReservationOrchestrator,
} from "@hcp/domain";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaAvailabilityRulesRepository } from "../../src/repositories/commerce/AvailabilityRulesRepository";
import { PrismaCatalogQueryAdapter } from "../../src/adapters/CatalogQueryAdapter";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import { truncateIntegrationTables, prisma } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

runIntegration("Outbox dispatch integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const calendarRepository = new PrismaCalendarBlockRepository();
  const ratePlanRepository = new PrismaRatePlanRepository();
  const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
  const catalogQueryAdapter = new PrismaCatalogQueryAdapter();
  const timezoneService = new TimezoneService();
  const permissionChecker = new PermissionChecker();
  const idGenerator = new UuidIdGenerator();

  const tenantId = "550e8400-e29b-41d4-a716-446655442060";
  const propertyId = "550e8400-e29b-41d4-a716-446655442061";
  const unitId = "550e8400-e29b-41d4-a716-446655442062";
  const adminActor = {
    userId: "550e8400-e29b-41d4-a716-446655442063",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

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

  it("dispatches commerce outbox events through LoggingHandler to completed", async () => {
    const pendingBefore = await prisma.outboxEvent.count({
      where: { status: "pending" },
    });

    const holdResult = await createHoldUseCase.execute(
      {
        tenantId,
        unitId,
        checkIn: "2027-03-01",
        checkOut: "2027-03-05",
        guestCount: 2,
      },
      adminActor,
    );

    expect(holdResult.isSuccess).toBe(true);
    const hold = holdResult.getValue();

    const pendingAfter = await prisma.outboxEvent.count({
      where: { status: "pending" },
    });
    expect(pendingAfter - pendingBefore).toBe(1);

    const pendingEvent = await prisma.outboxEvent.findFirst({
      where: {
        aggregateId: hold.id,
        eventType: "HoldCreated",
        status: "pending",
      },
    });
    expect(pendingEvent).not.toBeNull();

    const log = vi.fn();
    const registry = new OutboxHandlerRegistry();
    registry.register(new LoggingHandler(log));

    const dispatchUseCase = new ProcessOutboxBatchUseCase(
      outboxRepository,
      registry,
    );

    const dispatchResult = await dispatchUseCase.execute(10);
    expect(dispatchResult.isSuccess).toBe(true);
    expect(dispatchResult.getValue().completed).toBeGreaterThanOrEqual(1);
    expect(dispatchResult.getValue().deadLettered).toBe(0);

    expect(log.mock.calls.some((call) => call[0]?.eventType === "HoldCreated")).toBe(
      true,
    );

    const completedEvent = await prisma.outboxEvent.findUnique({
      where: { id: pendingEvent!.id },
    });
    expect(completedEvent?.status).toBe("completed");
    expect(completedEvent?.processedAt).not.toBeNull();
  });
});

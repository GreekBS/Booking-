import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  CreateHoldUseCase,
  EnqueueJobUseCase,
  EXPIRE_HOLDS_JOB_TYPE,
  ExpireHoldsJobHandler,
  JobHandlerRegistry,
  PermissionChecker,
  ProcessJobBatchUseCase,
  ReservationOrchestrator,
  ExpireHoldsUseCase,
} from "@hcp/domain";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaAvailabilityRulesRepository } from "../../src/repositories/commerce/AvailabilityRulesRepository";
import { PrismaCatalogQueryAdapter } from "../../src/adapters/CatalogQueryAdapter";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import {
  PrismaBackgroundJobRepository,
  PrismaJobScheduler,
} from "../../src/repositories/BackgroundJobRepository";
import { truncateIntegrationTables, prisma } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";


function expireHoldsIdempotencyKey(date = new Date()): string {
  return `expire_holds:${date.toISOString().slice(0, 16)}`;
}

runIntegration("Expire holds background job integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const calendarRepository = new PrismaCalendarBlockRepository();
  const ratePlanRepository = new PrismaRatePlanRepository();
  const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
  const catalogQueryAdapter = new PrismaCatalogQueryAdapter();
  const timezoneService = new TimezoneService();
  const permissionChecker = new PermissionChecker();
  const idGenerator = new UuidIdGenerator();

  const jobRepository = new PrismaBackgroundJobRepository();
  const jobScheduler = new PrismaJobScheduler(jobRepository);
  const enqueueJobUseCase = new EnqueueJobUseCase(jobScheduler);
  const expireHoldsUseCase = new ExpireHoldsUseCase(holdRepository);

  const tenantId = "550e8400-e29b-41d4-a716-446655442070";
  const propertyId = "550e8400-e29b-41d4-a716-446655442071";
  const unitId = "550e8400-e29b-41d4-a716-446655442072";
  const adminActor = {
    userId: "550e8400-e29b-41d4-a716-446655442073",
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

  it("expires stale holds via enqueue and jobs/run flow", async () => {
    const holdResult = await createHoldUseCase.execute(
      {
        tenantId,
        unitId,
        checkIn: "2027-04-01",
        checkOut: "2027-04-04",
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

    const enqueueResult = await enqueueJobUseCase.execute({
      jobType: EXPIRE_HOLDS_JOB_TYPE,
      payload: { limit: 100 },
      idempotencyKey: expireHoldsIdempotencyKey(),
    });
    expect(enqueueResult.isSuccess).toBe(true);

    const registry = new JobHandlerRegistry();
    registry.register(new ExpireHoldsJobHandler(expireHoldsUseCase));

    const runResult = await new ProcessJobBatchUseCase(jobRepository, registry).execute(10, {
      jobTypes: [EXPIRE_HOLDS_JOB_TYPE],
    });

    expect(runResult.isSuccess).toBe(true);
    expect(runResult.getValue()).toMatchObject({
      claimed: 1,
      completed: 1,
      retried: 0,
      deadLettered: 0,
    });

    const loadedHold = await holdRepository.findById(holdId, tenantId);
    expect(loadedHold?.status).toBe("expired");

    const blocks = await calendarRepository.findActiveBlocks(unitId, tenantId);
    expect(blocks).toHaveLength(0);

    const job = await prisma.backgroundJob.findUnique({
      where: { id: enqueueResult.getValue().id },
    });
    expect(job?.status).toBe("completed");
  });

  it("deduplicates expire_holds enqueue with the same idempotency key", async () => {
    const key = expireHoldsIdempotencyKey();

    const first = await enqueueJobUseCase.execute({
      jobType: EXPIRE_HOLDS_JOB_TYPE,
      payload: { limit: 100 },
      idempotencyKey: key,
    });
    const second = await enqueueJobUseCase.execute({
      jobType: EXPIRE_HOLDS_JOB_TYPE,
      payload: { limit: 100 },
      idempotencyKey: key,
    });

    expect(first.getValue().id).toBe(second.getValue().id);
    expect(await prisma.backgroundJob.count()).toBe(1);
  });
});

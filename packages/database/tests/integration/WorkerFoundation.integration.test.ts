/**
 * Worker foundation DB integration: wake + recovery + SKIP LOCKED safety.
 *
 * Gated on TEST_DATABASE_URL (never DATABASE_URL / Production).
 * When TEST_DATABASE_URL is missing, this suite is SKIPPED via runIntegration.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  EnqueueJobUseCase,
  JobHandlerRegistry,
  LoggingJobHandler,
  LOGGING_PING_JOB_TYPE,
  LoggingHandler,
  OutboxHandlerRegistry,
  ProcessJobBatchUseCase,
  ProcessOutboxBatchUseCase,
  CreateHoldUseCase,
  PermissionChecker,
  ReservationOrchestrator,
} from "@hcp/domain";
import {
  PrismaBackgroundJobRepository,
  PrismaJobScheduler,
  PrismaOutboxRepository,
  PrismaHoldRepository,
  PrismaCalendarBlockRepository,
  PrismaRatePlanRepository,
  PrismaAvailabilityRulesRepository,
  PrismaCatalogQueryAdapter,
  TimezoneService,
  UuidIdGenerator,
  TALOS_ASYNC_WAKE_JOBS_CHANNEL,
  TALOS_ASYNC_WAKE_OUTBOX_CHANNEL,
  notifyTalosAsyncWake,
} from "../../src/index";
import { truncateIntegrationTables, prisma } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";

runIntegration("Talos event-driven worker foundation integration", () => {
  const jobRepository = new PrismaBackgroundJobRepository();
  const jobScheduler = new PrismaJobScheduler(jobRepository);
  const enqueueJobUseCase = new EnqueueJobUseCase(jobScheduler);
  const outboxRepository = new PrismaOutboxRepository();

  const tenantId = "550e8400-e29b-41d4-a716-446655442060";
  const propertyId = "550e8400-e29b-41d4-a716-446655442061";
  const unitId = "550e8400-e29b-41d4-a716-446655442062";
  const adminActor = {
    userId: "550e8400-e29b-41d4-a716-446655442063",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  beforeEach(async () => {
    await truncateIntegrationTables();
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("A/H: existing pending job is processed on recovery without new enqueue", async () => {
    await enqueueJobUseCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "pre-existing" },
      idempotencyKey: "worker-preexisting",
    });

    const log = vi.fn();
    const registry = new JobHandlerRegistry();
    registry.register(new LoggingJobHandler(log));
    const run = new ProcessJobBatchUseCase(jobRepository, registry);

    // Recovery sweep path (no LISTEN delivery required).
    const result = await run.execute(10);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().completed).toBe(1);
    expect(log).toHaveBeenCalledOnce();

    const job = await prisma.backgroundJob.findFirst({
      where: { idempotencyKey: "worker-preexisting" },
    });
    expect(job?.status).toBe("completed");
  });

  it("B: durable job enqueue + wake NOTIFY then process", async () => {
    const enqueue = await enqueueJobUseCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "wake-me" },
      idempotencyKey: "worker-wake-job",
    });
    expect(enqueue.isSuccess).toBe(true);

    // Best-effort wake (LISTEN delivery simulation after durable commit).
    await notifyTalosAsyncWake(prisma, TALOS_ASYNC_WAKE_JOBS_CHANNEL);

    const log = vi.fn();
    const registry = new JobHandlerRegistry();
    registry.register(new LoggingJobHandler(log));
    const run = new ProcessJobBatchUseCase(jobRepository, registry);
    const result = await run.execute(10);

    expect(result.getValue().completed).toBe(1);
    expect(log).toHaveBeenCalledOnce();
  });

  it("C: lost/missing wake still processes via recovery claim", async () => {
    await enqueueJobUseCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "lost-wake" },
      idempotencyKey: "worker-lost-wake",
    });

    const log = vi.fn();
    const registry = new JobHandlerRegistry();
    registry.register(new LoggingJobHandler(log));
    // No notifyTalosAsyncWake — recovery-only.
    const result = await new ProcessJobBatchUseCase(jobRepository, registry).execute(10);
    expect(result.getValue().completed).toBe(1);
    expect(log).toHaveBeenCalledOnce();
  });

  it("D: duplicate wakes do not duplicate durable work", async () => {
    await enqueueJobUseCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "dup-wake" },
      idempotencyKey: "worker-dup-wake",
    });

    await notifyTalosAsyncWake(prisma, TALOS_ASYNC_WAKE_JOBS_CHANNEL);
    await notifyTalosAsyncWake(prisma, TALOS_ASYNC_WAKE_JOBS_CHANNEL);

    const log = vi.fn();
    const registry = new JobHandlerRegistry();
    registry.register(new LoggingJobHandler(log));
    const run = new ProcessJobBatchUseCase(jobRepository, registry);

    await run.execute(10);
    await run.execute(10);

    expect(log).toHaveBeenCalledOnce();
    expect(await prisma.backgroundJob.count()).toBe(1);
  });

  it("E: concurrent worker claims remain safe via SKIP LOCKED", async () => {
    await enqueueJobUseCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "race" },
      idempotencyKey: "worker-skip-locked",
    });

    const logA = vi.fn();
    const logB = vi.fn();
    const registryA = new JobHandlerRegistry();
    registryA.register(new LoggingJobHandler(logA));
    const registryB = new JobHandlerRegistry();
    registryB.register(new LoggingJobHandler(logB));

    const [a, b] = await Promise.all([
      new ProcessJobBatchUseCase(jobRepository, registryA).execute(10),
      new ProcessJobBatchUseCase(jobRepository, registryB).execute(10),
    ]);

    expect(a.isSuccess && b.isSuccess).toBe(true);
    expect(a.getValue().claimed + b.getValue().claimed).toBe(1);
    expect(logA.mock.calls.length + logB.mock.calls.length).toBe(1);
  });

  it("I: delayed runAt job is not processed early", async () => {
    const future = new Date(Date.now() + 60_000);
    await enqueueJobUseCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "later" },
      idempotencyKey: "worker-delayed",
      runAt: future,
    });

    const log = vi.fn();
    const registry = new JobHandlerRegistry();
    registry.register(new LoggingJobHandler(log));
    const result = await new ProcessJobBatchUseCase(jobRepository, registry).execute(10);

    expect(result.getValue().claimed).toBe(0);
    expect(log).not.toHaveBeenCalled();

    const pending = await prisma.backgroundJob.findFirst({
      where: { idempotencyKey: "worker-delayed" },
    });
    expect(pending?.status).toBe("pending");
  });

  it("F/G: outbox durable write + lost wake recovers via sweep", async () => {
    await seedCommerceFixture(
      { tenantId, propertyId, unitId },
      { adminUserId: adminActor.userId },
    );

    const holdRepository = new PrismaHoldRepository(outboxRepository);
    const calendarRepository = new PrismaCalendarBlockRepository();
    const ratePlanRepository = new PrismaRatePlanRepository();
    const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
    const catalogQueryAdapter = new PrismaCatalogQueryAdapter();
    const timezoneService = new TimezoneService();
    const permissionChecker = new PermissionChecker();
    const idGenerator = new UuidIdGenerator();

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

    const holdResult = await createHoldUseCase.execute(
      {
        tenantId,
        unitId,
        checkIn: "2027-04-01",
        checkOut: "2027-04-05",
        guestCount: 2,
      },
      adminActor,
    );
    expect(holdResult.isSuccess).toBe(true);

    // Wake may be lost — recovery claim must still process.
    await notifyTalosAsyncWake(prisma, TALOS_ASYNC_WAKE_OUTBOX_CHANNEL);

    const log = vi.fn();
    const registry = new OutboxHandlerRegistry();
    registry.register(new LoggingHandler(log));
    const dispatch = new ProcessOutboxBatchUseCase(outboxRepository, registry);
    const result = await dispatch.execute(10);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().completed).toBeGreaterThanOrEqual(1);
    expect(log.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("J: listener reconnect does not lose durable pending work", async () => {
    await enqueueJobUseCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "after-reconnect" },
      idempotencyKey: "worker-reconnect-pending",
    });

    // Simulate reconnect wake + recovery claim.
    await notifyTalosAsyncWake(prisma, TALOS_ASYNC_WAKE_JOBS_CHANNEL);

    const log = vi.fn();
    const registry = new JobHandlerRegistry();
    registry.register(new LoggingJobHandler(log));
    const result = await new ProcessJobBatchUseCase(jobRepository, registry).execute(10);
    expect(result.getValue().completed).toBe(1);
  });
});

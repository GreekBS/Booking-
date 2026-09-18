import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import {
  EnqueueJobUseCase,
  JobHandlerRegistry,
  LoggingJobHandler,
  LOGGING_PING_JOB_TYPE,
  ProcessJobBatchUseCase,
} from "@hcp/domain";
import {
  PrismaBackgroundJobRepository,
  PrismaJobScheduler,
} from "../../src/repositories/BackgroundJobRepository";
import { truncateIntegrationTables, prisma } from "./helpers";
import { runIntegration } from "./integrationGate";


runIntegration("Background job dispatch integration", () => {
  const jobRepository = new PrismaBackgroundJobRepository();
  const jobScheduler = new PrismaJobScheduler(jobRepository);
  const enqueueJobUseCase = new EnqueueJobUseCase(jobScheduler);

  beforeEach(async () => {
    await truncateIntegrationTables();
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("enqueues, dispatches logging_ping through LoggingJobHandler to completed", async () => {
    const enqueueResult = await enqueueJobUseCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "integration ping" },
      idempotencyKey: "logging-ping-integration",
    });

    expect(enqueueResult.isSuccess).toBe(true);
    const job = enqueueResult.getValue();

    const pending = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
    expect(pending?.status).toBe("pending");

    const log = vi.fn();
    const registry = new JobHandlerRegistry();
    registry.register(new LoggingJobHandler(log));

    const runUseCase = new ProcessJobBatchUseCase(jobRepository, registry);
    const runResult = await runUseCase.execute(10);

    expect(runResult.isSuccess).toBe(true);
    expect(runResult.getValue()).toMatchObject({
      claimed: 1,
      completed: 1,
      retried: 0,
      deadLettered: 0,
    });
    expect(log).toHaveBeenCalledOnce();

    const completed = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
    expect(completed?.status).toBe("completed");
    expect(completed?.completedAt).not.toBeNull();
    expect(completed?.nextRetryAt).toBeNull();
  });

  it("returns the same job for duplicate idempotent enqueue", async () => {
    const command = {
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "duplicate" },
      idempotencyKey: "duplicate-key",
    };

    const first = await enqueueJobUseCase.execute(command);
    const second = await enqueueJobUseCase.execute(command);

    expect(first.getValue().id).toBe(second.getValue().id);
    expect(await prisma.backgroundJob.count()).toBe(1);
  });

  it("sets next_retry_at when handler fails and reclaims after backoff elapsed", async () => {
    const enqueueResult = await enqueueJobUseCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "fail once" },
      idempotencyKey: "retry-key",
      maxAttempts: 3,
    });
    const jobId = enqueueResult.getValue().id;

    const failingRegistry = new JobHandlerRegistry();
    failingRegistry.register({
      canHandle: () => true,
      run: async () => {
        throw new Error("simulated handler failure");
      },
    });

    const failingRun = new ProcessJobBatchUseCase(jobRepository, failingRegistry);
    const failResult = await failingRun.execute(1);
    expect(failResult.getValue()).toMatchObject({
      claimed: 1,
      completed: 0,
      retried: 1,
      deadLettered: 0,
    });

    const afterFail = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    expect(afterFail?.status).toBe("pending");
    expect(afterFail?.attemptCount).toBe(1);
    expect(afterFail?.nextRetryAt).not.toBeNull();

    const immediateClaim = await jobRepository.claimBatch(1);
    expect(immediateClaim).toHaveLength(0);

    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { nextRetryAt: new Date(Date.now() - 1_000) },
    });

    const successRegistry = new JobHandlerRegistry();
    successRegistry.register(new LoggingJobHandler());

    const successRun = new ProcessJobBatchUseCase(jobRepository, successRegistry);
    const successResult = await successRun.execute(1);
    expect(successResult.getValue()).toMatchObject({
      claimed: 1,
      completed: 1,
      retried: 0,
      deadLettered: 0,
    });
  });
});

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

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

runIntegration("Job enqueue integration", () => {
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

  it("enqueues logging_ping with optional fields persisted", async () => {
    const runAt = new Date(Date.now() + 60_000);

    const result = await enqueueJobUseCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "enqueue integration" },
      idempotencyKey: "job-enqueue-fields",
      runAt,
      priority: 2,
      maxAttempts: 7,
      tenantId: null,
    });

    expect(result.isSuccess).toBe(true);
    const job = result.getValue();
    expect(job).toMatchObject({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "enqueue integration" },
      status: "pending",
      priority: 2,
      idempotencyKey: "job-enqueue-fields",
      attemptCount: 0,
      maxAttempts: 7,
      tenantId: null,
    });

    const row = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
    expect(row?.status).toBe("pending");
    expect(row?.priority).toBe(2);
    expect(row?.maxAttempts).toBe(7);
    expect(row?.runAt.toISOString()).toBe(runAt.toISOString());
  });

  it("returns the same job for duplicate idempotent enqueue", async () => {
    const command = {
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "duplicate enqueue" },
      idempotencyKey: "job-enqueue-duplicate",
    };

    const first = await enqueueJobUseCase.execute(command);
    const second = await enqueueJobUseCase.execute(command);

    expect(first.getValue().id).toBe(second.getValue().id);
    expect(await prisma.backgroundJob.count()).toBe(1);
  });

  it("does not claim jobs until run_at is due", async () => {
    const futureRunAt = new Date(Date.now() + 60 * 60 * 1000);

    const enqueueResult = await enqueueJobUseCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "future run" },
      idempotencyKey: "job-enqueue-future",
      runAt: futureRunAt,
    });
    const jobId = enqueueResult.getValue().id;

    const immediateClaim = await jobRepository.claimBatch(1);
    expect(immediateClaim).toHaveLength(0);

    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { runAt: new Date(Date.now() - 1_000) },
    });

    const registry = new JobHandlerRegistry();
    registry.register(new LoggingJobHandler(vi.fn()));

    const runUseCase = new ProcessJobBatchUseCase(jobRepository, registry);
    const runResult = await runUseCase.execute(1);

    expect(runResult.isSuccess).toBe(true);
    expect(runResult.getValue()).toMatchObject({
      claimed: 1,
      completed: 1,
    });
  });

  it("supports enqueue then run for logging_ping end-to-end", async () => {
    const enqueueResult = await enqueueJobUseCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "cron path" },
      idempotencyKey: "job-enqueue-run-path",
    });
    expect(enqueueResult.isSuccess).toBe(true);

    const log = vi.fn();
    const registry = new JobHandlerRegistry();
    registry.register(new LoggingJobHandler(log));

    const runUseCase = new ProcessJobBatchUseCase(jobRepository, registry);
    const runResult = await runUseCase.execute(10, {
      jobTypes: [LOGGING_PING_JOB_TYPE],
    });

    expect(runResult.getValue()).toMatchObject({
      claimed: 1,
      completed: 1,
    });
    expect(log).toHaveBeenCalledOnce();
  });
});

import { describe, it, expect, vi } from "vitest";
import type {
  BackgroundJobEntry,
  EnqueueJobCommand,
  IBackgroundJobRepository,
  IJobScheduler,
  JobFailureDisposition,
} from "../../../../src/shared/types/index";
import { EnqueueJobUseCase } from "../../../../src/platform/async/jobs/application/EnqueueJobUseCase";
import { ProcessJobBatchUseCase } from "../../../../src/platform/async/jobs/application/ProcessJobBatchUseCase";
import { CancelJobUseCase } from "../../../../src/platform/async/jobs/application/CancelJobUseCase";
import { JobHandlerRegistry } from "../../../../src/platform/async/jobs/handlers/JobHandlerRegistry";
import { LoggingJobHandler } from "../../../../src/platform/async/jobs/handlers/LoggingJobHandler";
import { LOGGING_PING_JOB_TYPE } from "../../../../src/platform/async/jobs/types/JobTypes";

function makeJob(overrides: Partial<BackgroundJobEntry> = {}): BackgroundJobEntry {
  return {
    id: "job-1",
    tenantId: null,
    jobType: LOGGING_PING_JOB_TYPE,
    payload: { message: "ping" },
    status: "processing",
    priority: 0,
    runAt: new Date("2027-01-01T00:00:00.000Z"),
    idempotencyKey: "key-1",
    attemptCount: 0,
    maxAttempts: 5,
    createdAt: new Date(),
    ...overrides,
  };
}

class FakeJobRepository implements IBackgroundJobRepository {
  private readonly jobs = new Map<string, BackgroundJobEntry & { lastError?: string }>();

  seed(job: BackgroundJobEntry): void {
    this.jobs.set(job.id, { ...job });
  }

  async enqueue(command: EnqueueJobCommand): Promise<BackgroundJobEntry> {
    if (command.idempotencyKey) {
      const existing = [...this.jobs.values()].find(
        (job) =>
          job.jobType === command.jobType &&
          job.idempotencyKey === command.idempotencyKey,
      );
      if (existing) {
        return existing;
      }
    }

    const job = makeJob({
      id: `job-${this.jobs.size + 1}`,
      tenantId: command.tenantId ?? null,
      jobType: command.jobType,
      payload: command.payload,
      status: "pending",
      runAt: command.runAt ?? new Date(),
      idempotencyKey: command.idempotencyKey ?? null,
      maxAttempts: command.maxAttempts ?? 5,
      priority: command.priority ?? 0,
    });
    this.jobs.set(job.id, job);
    return job;
  }

  async findById(id: string): Promise<BackgroundJobEntry | null> {
    return this.jobs.get(id) ?? null;
  }

  async claimBatch(limit: number): Promise<BackgroundJobEntry[]> {
    const pending = [...this.jobs.values()]
      .filter((job) => job.status === "pending")
      .slice(0, limit)
      .map((job) => ({ ...job, status: "processing" as const }));

    for (const job of pending) {
      this.jobs.set(job.id, job);
    }

    return pending;
  }

  async markCompleted(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      this.jobs.set(id, { ...job, status: "completed" });
    }
  }

  async markFailed(id: string, error: string): Promise<JobFailureDisposition> {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Missing job ${id}`);
    }

    const attemptCount = job.attemptCount + 1;
    if (attemptCount >= job.maxAttempts) {
      this.jobs.set(id, { ...job, status: "dead_letter", attemptCount, lastError: error });
      return "dead_letter";
    }

    this.jobs.set(id, { ...job, status: "pending", attemptCount, lastError: error });
    return "retry";
  }

  async cancel(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job || job.status !== "pending") {
      throw new Error("Only pending jobs can be cancelled");
    }
    this.jobs.set(id, { ...job, status: "cancelled" });
  }

  getStatus(id: string): BackgroundJobEntry["status"] | undefined {
    return this.jobs.get(id)?.status;
  }
}

class FakeJobScheduler implements IJobScheduler {
  constructor(private readonly repository: FakeJobRepository) {}

  schedule(command: EnqueueJobCommand) {
    return this.repository.enqueue(command);
  }

  cancel(jobId: string) {
    return this.repository.cancel(jobId);
  }
}

describe("LoggingJobHandler", () => {
  it("handles logging_ping jobs", async () => {
    const log = vi.fn();
    const handler = new LoggingJobHandler(log);
    const job = makeJob();

    expect(handler.canHandle(LOGGING_PING_JOB_TYPE)).toBe(true);
    await handler.run(job);
    expect(log).toHaveBeenCalledWith(job);
  });
});

describe("EnqueueJobUseCase", () => {
  it("schedules a job and returns idempotent duplicate", async () => {
    const repository = new FakeJobRepository();
    const useCase = new EnqueueJobUseCase(new FakeJobScheduler(repository));

    const first = await useCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "ping" },
      idempotencyKey: "same-key",
    });
    const second = await useCase.execute({
      jobType: LOGGING_PING_JOB_TYPE,
      payload: { message: "ping" },
      idempotencyKey: "same-key",
    });

    expect(first.isSuccess).toBe(true);
    expect(second.isSuccess).toBe(true);
    expect(first.getValue().id).toBe(second.getValue().id);
  });
});

describe("ProcessJobBatchUseCase", () => {
  it("claims jobs, runs handler, and marks them completed", async () => {
    const repository = new FakeJobRepository();
    repository.seed(makeJob({ id: "job-1", status: "pending" }));

    const log = vi.fn();
    const registry = new JobHandlerRegistry();
    registry.register(new LoggingJobHandler(log));

    const useCase = new ProcessJobBatchUseCase(repository, registry);
    const result = await useCase.execute(10);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({
      claimed: 1,
      completed: 1,
      retried: 0,
      deadLettered: 0,
    });
    expect(repository.getStatus("job-1")).toBe("completed");
  });

  it("retries handler failures until dead-letter threshold", async () => {
    const repository = new FakeJobRepository();
    repository.seed(makeJob({ id: "job-1", status: "pending", maxAttempts: 2 }));

    const registry = new JobHandlerRegistry();
    registry.register({
      canHandle: () => true,
      run: async () => {
        throw new Error("handler failed");
      },
    });

    const useCase = new ProcessJobBatchUseCase(repository, registry);

    const firstPass = await useCase.execute(1);
    expect(firstPass.getValue()).toMatchObject({
      claimed: 1,
      completed: 0,
      retried: 1,
      deadLettered: 0,
    });
    expect(repository.getStatus("job-1")).toBe("pending");

    const secondPass = await useCase.execute(1);
    expect(secondPass.getValue()).toMatchObject({
      claimed: 1,
      completed: 0,
      retried: 0,
      deadLettered: 1,
    });
    expect(repository.getStatus("job-1")).toBe("dead_letter");
  });
});

describe("CancelJobUseCase", () => {
  it("cancels pending jobs", async () => {
    const repository = new FakeJobRepository();
    repository.seed(makeJob({ id: "job-1", status: "pending" }));

    const useCase = new CancelJobUseCase(new FakeJobScheduler(repository));
    const result = await useCase.execute("job-1");

    expect(result.isSuccess).toBe(true);
    expect(repository.getStatus("job-1")).toBe("cancelled");
  });
});

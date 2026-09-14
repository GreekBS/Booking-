import { describe, it, expect, beforeEach, vi } from "vitest";
import { EnqueueJobUseCase } from "../../src/platform/async/jobs/application/EnqueueJobUseCase";
import { PROCESS_CHANNEL_INBOX_JOB_TYPE } from "../../src/platform/async/jobs/types/JobTypes";
import { InMemoryChannelInboxRepository } from "../../src/channels/repositories/InMemoryChannelInboxRepository";
import { ReceiveChannelEventUseCase } from "../../src/channels/application/ReceiveChannelEventUseCase";
import {
  buildSimulatedProviderMessage,
  DEFAULT_SIMULATED_FIXTURE,
} from "../../src/channels/simulation/SimulatedReservationFixtures";
import { FAKE_CHANNEL_PROVIDER_ID } from "../../src/channels/simulation/FakeChannelReservationImportProvider";
import type { IJobScheduler } from "../../src/platform/async/jobs/ports/IJobScheduler";
import type { EnqueueJobCommand, BackgroundJobEntry } from "../../src/shared/types/index";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440100";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440101";

class InMemoryJobScheduler implements IJobScheduler {
  readonly jobs = new Map<string, BackgroundJobEntry>();
  shouldFail = false;

  async schedule(command: EnqueueJobCommand): Promise<BackgroundJobEntry> {
    if (this.shouldFail) {
      throw new Error("job scheduling failed");
    }
    const key = command.idempotencyKey ?? command.jobType;
    const existing = [...this.jobs.values()].find(
      (job) => job.jobType === command.jobType && job.idempotencyKey === command.idempotencyKey,
    );
    if (existing) {
      return existing;
    }
    const job: BackgroundJobEntry = {
      id: `job-${this.jobs.size + 1}`,
      tenantId: command.tenantId ?? null,
      jobType: command.jobType,
      payload: command.payload,
      status: "pending",
      priority: command.priority ?? 0,
      runAt: command.runAt ?? new Date(),
      idempotencyKey: command.idempotencyKey ?? null,
      attemptCount: 0,
      maxAttempts: command.maxAttempts ?? 5,
    createdAt: new Date(),
    };
    this.jobs.set(key, job);
    return job;
  }

  async cancel(): Promise<void> {}
}

describe("ReceiveChannelEventUseCase", () => {
  let inboxRepository: InMemoryChannelInboxRepository;
  let jobScheduler: InMemoryJobScheduler;
  let useCase: ReceiveChannelEventUseCase;
  let idCounter: number;

  beforeEach(() => {
    inboxRepository = new InMemoryChannelInboxRepository();
    jobScheduler = new InMemoryJobScheduler();
    idCounter = 0;
    useCase = new ReceiveChannelEventUseCase(
      inboxRepository,
      new EnqueueJobUseCase(jobScheduler),
      { generate: () => `inbox-${++idCounter}` },
    );
  });

  function buildMessage() {
    return buildSimulatedProviderMessage({
      messageId: "msg-receive-001",
      connectionId: CONNECTION_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      externalListingId: "fake-listing-100",
      externalUnitId: "fake-room-a",
      externalReservationId: "fake-res-receive-001",
      payload: DEFAULT_SIMULATED_FIXTURE,
    });
  }

  it("creates inbox item and durable job", async () => {
    const result = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      ingressKind: "webhook",
      message: buildMessage(),
    });

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.deduplicated).toBe(false);
    expect(jobScheduler.jobs.size).toBe(1);

    const inbox = await inboxRepository.findById(TENANT_ID, value.inboxItemId);
    expect(inbox?.status).toBe("received");
  });

  it("fails when job scheduling fails", async () => {
    jobScheduler.shouldFail = true;
    const result = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      ingressKind: "webhook",
      message: buildMessage(),
    });
    expect(result.isFailure).toBe(true);
    expect(jobScheduler.jobs.size).toBe(0);
  });

  it("reconciles missing job on deduplicated receive", async () => {
    jobScheduler.shouldFail = true;
    await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      ingressKind: "webhook",
      message: buildMessage(),
    });

    jobScheduler.shouldFail = false;
    const retry = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      ingressKind: "webhook",
      message: buildMessage(),
    });

    expect(retry.isSuccess).toBe(true);
    expect(retry.getValue().deduplicated).toBe(true);
    expect(jobScheduler.jobs.size).toBe(1);
  });

  it("deduplicates identical create events", async () => {
    const first = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      ingressKind: "poll",
      message: buildMessage(),
    });
    const second = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      ingressKind: "poll",
      message: buildMessage(),
    });

    expect(first.isSuccess).toBe(true);
    expect(second.isSuccess).toBe(true);
    expect(second.getValue().inboxItemId).toBe(first.getValue().inboxItemId);
    expect(second.getValue().deduplicated).toBe(true);
  });
});

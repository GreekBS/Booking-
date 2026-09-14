import { describe, it, expect, beforeEach } from "vitest";
import { EnqueueJobUseCase } from "../../src/platform/async/jobs/application/EnqueueJobUseCase";
import { PROCESS_CHANNEL_INBOX_JOB_TYPE } from "../../src/platform/async/jobs/types/JobTypes";
import { InMemoryChannelInboxRepository } from "../../src/channels/repositories/InMemoryChannelInboxRepository";
import { ReceiveChannelEventUseCase } from "../../src/channels/application/ReceiveChannelEventUseCase";
import { buildTransportTestMessage } from "./fixtures/testChannelTransportFixtures";
import { TEST_CHANNEL_TRANSPORT_PROVIDER_ID } from "../../src/channels/simulation/TestChannelTransportProviderBundle";
import type { IJobScheduler } from "../../src/platform/async/jobs/ports/IJobScheduler";
import type { EnqueueJobCommand, BackgroundJobEntry } from "../../src/shared/types/index";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440100";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440101";

class InMemoryJobScheduler implements IJobScheduler {
  readonly jobs = new Map<string, BackgroundJobEntry>();

  async schedule(command: EnqueueJobCommand): Promise<BackgroundJobEntry> {
    const key = command.idempotencyKey ?? command.jobType;
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

describe("ReceiveChannelEventUseCase reservation deduplication", () => {
  let inboxRepository: InMemoryChannelInboxRepository;
  let useCase: ReceiveChannelEventUseCase;

  beforeEach(() => {
    inboxRepository = new InMemoryChannelInboxRepository();
    useCase = new ReceiveChannelEventUseCase(
      inboxRepository,
      new EnqueueJobUseCase(new InMemoryJobScheduler()),
      { generate: () => `inbox-${Math.random()}` },
    );
  });

  it("auto-derives dedup keys for reservation.modify", async () => {
    const message = buildTransportTestMessage({
      messageId: "msg-modify",
      kind: "reservation.modify",
      connectionId: CONNECTION_ID,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      externalReservationId: "ext-modify",
      payload: { externalRevision: "rev-1" },
    });

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      ingressKind: "webhook",
      message,
    });

    expect(result.isSuccess).toBe(true);
  });

  it("durably receives reservation.unknown without externalReservationId", async () => {
    const message = buildTransportTestMessage({
      messageId: "msg-unknown",
      kind: "reservation.unknown",
      connectionId: CONNECTION_ID,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      payload: { providerEventId: "provider-event-1" },
    });

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      ingressKind: "webhook",
      message,
    });

    expect(result.isSuccess).toBe(true);
    const inboxId = result.getValue().inboxItemId;
    const stored = await inboxRepository.findById(TENANT_ID, inboxId);
    expect(stored?.messageKind).toBe("reservation.unknown");
  });

  it("deduplicates duplicate unknown events with the same stable identity", async () => {
    const message = buildTransportTestMessage({
      messageId: "msg-unknown-dup",
      kind: "reservation.unknown",
      connectionId: CONNECTION_ID,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      payload: { providerEventId: "provider-event-dup" },
    });

    const first = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      ingressKind: "webhook",
      message,
    });
    const second = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      ingressKind: "webhook",
      message: { ...message, messageId: "msg-unknown-dup-2" },
    });

    expect(first.isSuccess).toBe(true);
    expect(second.isSuccess).toBe(true);
    expect(second.getValue().deduplicated).toBe(true);
    expect(second.getValue().inboxItemId).toBe(first.getValue().inboxItemId);
  });

  it("uses maintenance dedup keys for connectivity.test", async () => {
    const message = buildTransportTestMessage({
      messageId: "msg-maint",
      kind: "connectivity.test",
      connectionId: CONNECTION_ID,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      payload: { providerEventId: "maint-evt-1" },
    });

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      ingressKind: "webhook",
      message,
    });

    expect(result.isSuccess).toBe(true);
    const stored = await inboxRepository.findById(TENANT_ID, result.getValue().inboxItemId);
    expect(stored?.deduplicationKey).toBe(
      `ingress:maintenance:${CONNECTION_ID}:connectivity.test:maint-evt-1`,
    );
  });
});

describe("ReceiveChannelEventUseCase existing behavior", () => {
  it("still enqueues process_channel_inbox jobs for create events", async () => {
    const scheduler = new InMemoryJobScheduler();
    const useCase = new ReceiveChannelEventUseCase(
      new InMemoryChannelInboxRepository(),
      new EnqueueJobUseCase(scheduler),
      { generate: () => "inbox-create-1" },
    );

    await useCase.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      ingressKind: "webhook",
      message: buildTransportTestMessage({
        messageId: "msg-create",
        kind: "reservation.create",
        connectionId: CONNECTION_ID,
        provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
        externalReservationId: "ext-create",
        payload: {},
      }),
    });

    expect([...scheduler.jobs.values()].some((job) => job.jobType === PROCESS_CHANNEL_INBOX_JOB_TYPE)).toBe(
      true,
    );
  });
});

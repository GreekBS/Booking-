import { describe, expect, it, vi, beforeEach } from "vitest";
import { Result } from "../../src/shared/kernel/Result";
import { ConflictError, ForbiddenError, NotFoundError } from "../../src/shared/errors/DomainError";
import type { ActorContext } from "../../src/shared/services/PermissionChecker";
import type { BackgroundJobEntry } from "../../src/shared/types/index";
import type { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import {
  EnqueueChannelConnectionPollUseCase,
  buildPollChannelConnectionIdempotencyKey,
} from "../../src/channels/application/EnqueueChannelConnectionPollUseCase";
import {
  buildManualPollIdempotencyKey,
  buildRecoveryPollIdempotencyKey,
  buildScheduledPollIdempotencyKey,
  icalPollBucket,
  resolveIcalPollIntervalMs,
} from "../../src/channels/providers/ical/inventory/icalPollJobIdentity";
import { POLL_CHANNEL_CONNECTION_JOB_TYPE } from "../../src/platform/async/jobs/types/JobTypes";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import { InMemoryChannelPollJobQuery } from "../../src/channels/repositories/InMemoryChannelPollJobQuery";

function job(overrides: Partial<BackgroundJobEntry> = {}): BackgroundJobEntry {
  return {
    id: "job-1",
    tenantId: "tenant-1",
    jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
    payload: { connectionId: "conn-1" },
    status: "pending",
    priority: 0,
    runAt: new Date(),
    idempotencyKey: "poll_channel_connection:tenant-1:conn-1:manual:1",
    attemptCount: 0,
    maxAttempts: 5,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("EnqueueChannelConnectionPollUseCase (P1-S7b)", () => {
  const tenantId = "tenant-1";
  const connectionId = "conn-1";
  const actor: ActorContext = {
    userId: "user-1",
    role: "admin",
    propertyIds: null,
    isSuperAdmin: false,
  };

  let connectionRepository: { findById: ReturnType<typeof vi.fn> };
  let providerRegistry: { get: ReturnType<typeof vi.fn> };
  let enqueueJobUseCase: { execute: ReturnType<typeof vi.fn> };
  let jobs: BackgroundJobEntry[];
  let pollJobQuery: InMemoryChannelPollJobQuery;
  let useCase: EnqueueChannelConnectionPollUseCase;
  const now = new Date("2026-09-14T12:00:00.000Z");
  const intervalMs = resolveIcalPollIntervalMs(undefined);
  const bucket = icalPollBucket(now.getTime(), intervalMs);

  beforeEach(() => {
    connectionRepository = {
      findById: vi.fn(),
    };
    providerRegistry = {
      get: vi.fn(),
    };
    enqueueJobUseCase = {
      execute: vi.fn(),
    };
    jobs = [];
    pollJobQuery = new InMemoryChannelPollJobQuery(() => jobs);
    useCase = new EnqueueChannelConnectionPollUseCase(
      connectionRepository as never,
      providerRegistry as never,
      enqueueJobUseCase as never,
      new PermissionChecker(),
      pollJobQuery,
    );
  });

  it("builds legacy key helper (deprecated)", () => {
    expect(buildPollChannelConnectionIdempotencyKey(tenantId, connectionId)).toBe(
      "poll_channel_connection:tenant-1:conn-1",
    );
  });

  it("enqueues manual:{bucket} when no in-flight poll", async () => {
    connectionRepository.findById.mockResolvedValue({
      status: "active",
      provider: "ical",
    } as ChannelConnection);
    providerRegistry.get.mockReturnValue({
      capabilities: { inbound: { polling: true } },
      polling: {},
    });
    const pending = job({
      idempotencyKey: buildManualPollIdempotencyKey(tenantId, connectionId, bucket),
    });
    enqueueJobUseCase.execute.mockResolvedValue(Result.ok(pending));

    const result = await useCase.execute({ tenantId, connectionId, now }, actor);
    expect(result.isSuccess).toBe(true);
    expect(enqueueJobUseCase.execute).toHaveBeenCalledWith({
      tenantId,
      jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
      payload: { connectionId },
      idempotencyKey: buildManualPollIdempotencyKey(tenantId, connectionId, bucket),
      runAt: now,
    });
    expect(result.getValue().reusedExisting).toBe(false);
  });

  it("returns in-flight poll without creating a second job", async () => {
    connectionRepository.findById.mockResolvedValue({
      status: "active",
      provider: "ical",
    } as ChannelConnection);
    providerRegistry.get.mockReturnValue({
      capabilities: { inbound: { polling: true } },
      polling: {},
    });
    jobs.push(
      job({
        id: "in-flight",
        status: "pending",
        idempotencyKey: buildScheduledPollIdempotencyKey(tenantId, connectionId, bucket),
      }),
    );

    const result = await useCase.execute({ tenantId, connectionId, now }, actor);
    expect(result.isSuccess).toBe(true);
    expect(enqueueJobUseCase.execute).not.toHaveBeenCalled();
    expect(result.getValue().job.id).toBe("in-flight");
    expect(result.getValue().reusedExisting).toBe(true);
  });

  it("uses recovery:{deadLetterJobId} when latest poll is dead_letter", async () => {
    connectionRepository.findById.mockResolvedValue({
      status: "active",
      provider: "ical",
    } as ChannelConnection);
    providerRegistry.get.mockReturnValue({
      capabilities: { inbound: { polling: true } },
      polling: {},
    });
    jobs.push(
      job({
        id: "dl-1",
        status: "dead_letter",
        idempotencyKey: buildManualPollIdempotencyKey(tenantId, connectionId, bucket - 1),
      }),
    );
    const recoveryKey = buildRecoveryPollIdempotencyKey(tenantId, connectionId, "dl-1");
    enqueueJobUseCase.execute.mockResolvedValue(
      Result.ok(job({ id: "recovery-1", idempotencyKey: recoveryKey })),
    );

    const result = await useCase.execute({ tenantId, connectionId, now }, actor);
    expect(result.isSuccess).toBe(true);
    expect(enqueueJobUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: recoveryKey,
      }),
    );
  });

  it("scheduled mode uses sched:{bucket} with jittered runAt", async () => {
    connectionRepository.findById.mockResolvedValue({
      status: "active",
      provider: "ical",
    } as ChannelConnection);
    providerRegistry.get.mockReturnValue({
      capabilities: { inbound: { polling: true } },
      polling: {},
    });
    enqueueJobUseCase.execute.mockResolvedValue(
      Result.ok(
        job({
          idempotencyKey: buildScheduledPollIdempotencyKey(tenantId, connectionId, bucket),
        }),
      ),
    );

    const result = await useCase.execute(
      {
        tenantId,
        connectionId,
        mode: "scheduled",
        now,
        random: () => 0.5,
        bypassPermissionCheck: true,
      },
      actor,
    );
    expect(result.isSuccess).toBe(true);
    const call = enqueueJobUseCase.execute.mock.calls[0]![0];
    expect(call.idempotencyKey).toBe(
      buildScheduledPollIdempotencyKey(tenantId, connectionId, bucket),
    );
    expect(call.runAt.getTime()).toBeGreaterThan(now.getTime());
    expect(call.runAt.getTime()).toBeLessThanOrEqual(
      now.getTime() + Math.floor(intervalMs * 0.1),
    );
  });

  it("rejects inactive connection", async () => {
    connectionRepository.findById.mockResolvedValue({
      status: "paused",
      provider: "ical",
    } as ChannelConnection);
    const result = await useCase.execute({ tenantId, connectionId }, actor);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
    expect(enqueueJobUseCase.execute).not.toHaveBeenCalled();
  });

  it("rejects unregistered polling provider", async () => {
    connectionRepository.findById.mockResolvedValue({
      status: "active",
      provider: "ical",
    } as ChannelConnection);
    providerRegistry.get.mockReturnValue(null);
    const result = await useCase.execute({ tenantId, connectionId }, actor);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
  });

  it("rejects missing connection", async () => {
    connectionRepository.findById.mockResolvedValue(null);
    const result = await useCase.execute({ tenantId, connectionId }, actor);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(NotFoundError);
  });

  it("rejects forbidden actor", async () => {
    const manager: ActorContext = {
      ...actor,
      role: "manager",
      propertyIds: [],
    };
    const result = await useCase.execute({ tenantId, connectionId }, manager);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
    expect(connectionRepository.findById).not.toHaveBeenCalled();
  });

  it("never creates unkeyed poll jobs", async () => {
    connectionRepository.findById.mockResolvedValue({
      status: "active",
      provider: "ical",
    } as ChannelConnection);
    providerRegistry.get.mockReturnValue({
      capabilities: { inbound: { polling: true } },
      polling: {},
    });
    enqueueJobUseCase.execute.mockResolvedValue(Result.ok(job()));

    await useCase.execute({ tenantId, connectionId, now }, actor);
    const call = enqueueJobUseCase.execute.mock.calls[0]![0];
    expect(call.idempotencyKey).toBeTruthy();
    expect(typeof call.idempotencyKey).toBe("string");
  });
});

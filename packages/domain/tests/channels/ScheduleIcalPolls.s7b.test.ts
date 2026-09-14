import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelPollJobQuery } from "../../src/channels/repositories/InMemoryChannelPollJobQuery";
import { EnqueueChannelConnectionPollUseCase } from "../../src/channels/application/EnqueueChannelConnectionPollUseCase";
import { ScheduleIcalPollsUseCase } from "../../src/channels/application/ScheduleIcalPollsUseCase";
import { EnqueueJobUseCase } from "../../src/platform/async/jobs/application/EnqueueJobUseCase";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import { ChannelProviderRegistry } from "../../src/channels/providers/ChannelProviderRegistry";
import { withDefaultProviderRegistrationPolicies } from "../../src/channels/ports/providers/ChannelProviderRegistration";
import { ICAL_PROVIDER_CAPABILITIES } from "../../src/channels/types/ChannelCapabilities";
import type {
  BackgroundJobEntry,
  EnqueueJobCommand,
  IJobScheduler,
} from "../../src/shared/types/index";
import {
  POLL_CHANNEL_CONNECTION_JOB_TYPE,
  SWEEP_PENDING_ICAL_INVENTORY_RECONCILE_JOB_TYPE,
} from "../../src/platform/async/jobs/types/JobTypes";
import {
  buildManualPollIdempotencyKey,
  buildRecoveryPollIdempotencyKey,
  buildScheduledPollIdempotencyKey,
  icalPollBucket,
  resolveIcalPollIntervalMs,
} from "../../src/channels/providers/ical/inventory/icalPollJobIdentity";
import type { EligibleIcalPollConnection } from "../../src/channels/ports/IEligibleIcalPollConnectionReader";

const TENANT = "tenant-s7b";
const CONNECTION = "conn-s7b";
const INTERVAL = 15 * 60 * 1000;

class FakeJobScheduler implements IJobScheduler {
  readonly jobs: BackgroundJobEntry[] = [];
  private seq = 0;

  async schedule(command: EnqueueJobCommand): Promise<BackgroundJobEntry> {
    if (command.idempotencyKey) {
      const existing = this.jobs.find(
        (j) => j.jobType === command.jobType && j.idempotencyKey === command.idempotencyKey,
      );
      if (existing) return existing;
    }
    this.seq += 1;
    const job: BackgroundJobEntry = {
      id: `job-${this.seq}`,
      tenantId: command.tenantId ?? null,
      jobType: command.jobType,
      payload: command.payload,
      status: "pending",
      priority: command.priority ?? 0,
      runAt: command.runAt ?? new Date(),
      idempotencyKey: command.idempotencyKey ?? null,
      attemptCount: 0,
      maxAttempts: command.maxAttempts ?? 5,
      createdAt: new Date(Date.now() + this.seq),
    };
    this.jobs.push(job);
    return job;
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (job) job.status = "cancelled";
  }
}

function pollingRegistration() {
  return withDefaultProviderRegistrationPolicies({
    providerId: "ical",
    status: "active",
    capabilities: ICAL_PROVIDER_CAPABILITIES,
    auth: null,
    webhooks: null,
    polling: {
      poll: async () => {
        throw new Error("scheduler must not call provider");
      },
    } as never,
    reservationImport: null,
    availabilityExport: null,
    rateRestrictionExport: null,
    reservationExport: null,
  });
}

describe("P1-S7b ScheduleIcalPollsUseCase + poll identity", () => {
  let connections: InMemoryChannelConnectionRepository;
  let scheduler: FakeJobScheduler;
  let enqueue: EnqueueJobUseCase;
  let pollQuery: InMemoryChannelPollJobQuery;
  let registry: ChannelProviderRegistry;
  let enqueuePoll: EnqueueChannelConnectionPollUseCase;
  let eligible: EligibleIcalPollConnection[];
  let pollingEnabled: boolean;
  let previousInterval: string | undefined;
  let previousApply: string | undefined;
  const now = new Date("2026-09-14T12:00:00.000Z");
  const bucket = icalPollBucket(now.getTime(), INTERVAL);

  beforeEach(async () => {
    previousInterval = process.env.CHANNELS_ICAL_POLL_INTERVAL_MS;
    previousApply = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_ICAL_POLL_INTERVAL_MS = String(INTERVAL);
    delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;

    connections = new InMemoryChannelConnectionRepository();
    scheduler = new FakeJobScheduler();
    enqueue = new EnqueueJobUseCase(scheduler);
    pollQuery = new InMemoryChannelPollJobQuery(() => scheduler.jobs);
    registry = new ChannelProviderRegistry();
    registry.register(pollingRegistration());
    eligible = [{ tenantId: TENANT, connectionId: CONNECTION }];
    pollingEnabled = true;

    const connection = ChannelConnection.createDraft({
      id: CONNECTION,
      tenantId: TENANT,
      provider: "ical",
      displayName: "S7b",
    });
    connection.attachCredentials(CredentialReference.create("cred_s7b"));
    connection.activate();
    await connections.create(connection);
    connection.applySemanticModeChange("availability_block_feed");
    await connections.persistSemanticState({
      tenantId: TENANT,
      connectionId: CONNECTION,
      expectedSemanticConfigVersion: 1,
      semanticMode: connection.semanticMode,
      semanticConfigVersion: connection.semanticConfigVersion,
      updatedAt: connection.updatedAt,
    });

    enqueuePoll = new EnqueueChannelConnectionPollUseCase(
      connections,
      registry,
      enqueue,
      new PermissionChecker(),
      pollQuery,
    );
  });

  afterEach(() => {
    if (previousInterval === undefined) delete process.env.CHANNELS_ICAL_POLL_INTERVAL_MS;
    else process.env.CHANNELS_ICAL_POLL_INTERVAL_MS = previousInterval;
    if (previousApply === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previousApply;
  });

  function scheduleUc() {
    return new ScheduleIcalPollsUseCase(
      { listEligible: async () => eligible },
      pollQuery,
      enqueuePoll,
      enqueue,
      registry,
      () => pollingEnabled,
      () => {},
    );
  }

  it("eligible active iCal connection → scheduled poll", async () => {
    const result = await scheduleUc().execute({ now, random: () => 0 });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().enqueuedPolls).toBe(1);
    const polls = scheduler.jobs.filter((j) => j.jobType === POLL_CHANNEL_CONNECTION_JOB_TYPE);
    expect(polls).toHaveLength(1);
    expect(polls[0]!.idempotencyKey).toBe(
      buildScheduledPollIdempotencyKey(TENANT, CONNECTION, bucket),
    );
  });

  it("polling flag OFF → skipped", async () => {
    pollingEnabled = false;
    const result = await scheduleUc().execute({ now });
    expect(result.getValue().examined).toBe(0);
    expect(result.getValue().enqueuedPolls).toBe(0);
  });

  it("apply OFF → poll still scheduled + sweep keyed", async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "false";
    const result = await scheduleUc().execute({ now, random: () => 0 });
    expect(result.getValue().enqueuedPolls).toBe(1);
    expect(result.getValue().enqueuedSweep).toBe(1);
    const sweeps = scheduler.jobs.filter(
      (j) => j.jobType === SWEEP_PENDING_ICAL_INVENTORY_RECONCILE_JOB_TYPE,
    );
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0]!.idempotencyKey).toBe(
      `sweep_pending_ical_inventory_reconcile:sched:${bucket}`,
    );
  });

  it("two concurrent scheduler calls same bucket → ≤1 poll job", async () => {
    const uc = scheduleUc();
    const [a, b] = await Promise.all([
      uc.execute({ now, random: () => 0 }),
      uc.execute({ now, random: () => 0 }),
    ]);
    expect(a.isSuccess && b.isSuccess).toBe(true);
    const polls = scheduler.jobs.filter((j) => j.jobType === POLL_CHANNEL_CONNECTION_JOB_TYPE);
    expect(polls).toHaveLength(1);
  });

  it("same scheduler retried same bucket → same job / no duplicate", async () => {
    const uc = scheduleUc();
    await uc.execute({ now, random: () => 0 });
    await uc.execute({ now, random: () => 0 });
    const polls = scheduler.jobs.filter((j) => j.jobType === POLL_CHANNEL_CONNECTION_JOB_TYPE);
    expect(polls).toHaveLength(1);
  });

  it("pending → skipped", async () => {
    await scheduleUc().execute({ now, random: () => 0 });
    const again = await scheduleUc().execute({ now, random: () => 0 });
    expect(again.getValue().skippedReasons.inFlight).toBe(1);
    expect(
      scheduler.jobs.filter((j) => j.jobType === POLL_CHANNEL_CONNECTION_JOB_TYPE),
    ).toHaveLength(1);
  });

  it("processing → skipped", async () => {
    await scheduleUc().execute({ now, random: () => 0 });
    scheduler.jobs[0]!.status = "processing";
    const again = await scheduleUc().execute({ now, random: () => 0 });
    expect(again.getValue().skippedReasons.inFlight).toBe(1);
  });

  it("retry-scheduled pending → skipped", async () => {
    await scheduleUc().execute({ now, random: () => 0 });
    scheduler.jobs[0]!.runAt = new Date(now.getTime() + 60_000);
    scheduler.jobs[0]!.attemptCount = 2;
    const again = await scheduleUc().execute({ now, random: () => 0 });
    expect(again.getValue().skippedReasons.inFlight).toBe(1);
  });

  it("dead_letter → skipped", async () => {
    await scheduleUc().execute({ now, random: () => 0 });
    scheduler.jobs[0]!.status = "dead_letter";
    const again = await scheduleUc().execute({ now, random: () => 0 });
    expect(again.getValue().skippedReasons.deadLetter).toBe(1);
    expect(
      scheduler.jobs.filter((j) => j.jobType === POLL_CHANNEL_CONNECTION_JOB_TYPE),
    ).toHaveLength(1);
  });

  it("completed within interval → skipped", async () => {
    await scheduleUc().execute({ now, random: () => 0 });
    const poll = scheduler.jobs[0]!;
    poll.status = "completed";
    pollQuery.setCompletedAt(poll.id, now);
    const again = await scheduleUc().execute({
      now: new Date(now.getTime() + INTERVAL / 2),
      random: () => 0,
    });
    expect(again.getValue().skippedReasons.sameBucketTerminal).toBe(1);
  });

  it("next bucket after successful terminal poll → exactly one new job", async () => {
    await scheduleUc().execute({ now, random: () => 0 });
    const poll = scheduler.jobs[0]!;
    poll.status = "completed";
    pollQuery.setCompletedAt(poll.id, now);
    const nextNow = new Date(now.getTime() + INTERVAL);
    const nextBucket = icalPollBucket(nextNow.getTime(), INTERVAL);
    const again = await scheduleUc().execute({ now: nextNow, random: () => 0 });
    expect(again.getValue().enqueuedPolls).toBe(1);
    const polls = scheduler.jobs.filter((j) => j.jobType === POLL_CHANNEL_CONNECTION_JOB_TYPE);
    expect(polls).toHaveLength(2);
    expect(polls[1]!.idempotencyKey).toBe(
      buildScheduledPollIdempotencyKey(TENANT, CONNECTION, nextBucket),
    );
  });

  it("provider not registered → skipped", async () => {
    const emptyRegistry = new ChannelProviderRegistry();
    const uc = new ScheduleIcalPollsUseCase(
      { listEligible: async () => eligible },
      pollQuery,
      enqueuePoll,
      enqueue,
      emptyRegistry,
      () => true,
    );
    const result = await uc.execute({ now });
    expect(result.getValue().skippedReasons.providerNotRegistered).toBe(1);
  });

  it("repeated scheduler → no duplicate sweep", async () => {
    const uc = scheduleUc();
    await uc.execute({ now, random: () => 0 });
    await uc.execute({ now, random: () => 0 });
    const sweeps = scheduler.jobs.filter(
      (j) => j.jobType === SWEEP_PENDING_ICAL_INVENTORY_RECONCILE_JOB_TYPE,
    );
    expect(sweeps).toHaveLength(1);
  });

  it("manual concurrent requests converge on manual:{bucket}", async () => {
    const actor = {
      userId: "admin-1",
      role: "admin" as const,
      propertyIds: null,
      isSuperAdmin: true,
    };
    const [a, b] = await Promise.all([
      enqueuePoll.execute({ tenantId: TENANT, connectionId: CONNECTION, now }, actor),
      enqueuePoll.execute({ tenantId: TENANT, connectionId: CONNECTION, now }, actor),
    ]);
    expect(a.isSuccess && b.isSuccess).toBe(true);
    expect(a.getValue().job.id).toBe(b.getValue().job.id);
    expect(a.getValue().job.idempotencyKey).toBe(
      buildManualPollIdempotencyKey(TENANT, CONNECTION, bucket),
    );
  });

  it("manual while scheduled pending returns existing in-flight", async () => {
    await scheduleUc().execute({ now, random: () => 0 });
    const actor = {
      userId: "admin-1",
      role: "admin" as const,
      propertyIds: null,
      isSuperAdmin: true,
    };
    const manual = await enqueuePoll.execute(
      { tenantId: TENANT, connectionId: CONNECTION, now },
      actor,
    );
    expect(manual.isSuccess).toBe(true);
    expect(manual.getValue().reusedExisting).toBe(true);
    expect(
      scheduler.jobs.filter((j) => j.jobType === POLL_CHANNEL_CONNECTION_JOB_TYPE),
    ).toHaveLength(1);
  });

  it("manual after completed scheduled poll in same bucket → one manual:{bucket}", async () => {
    await scheduleUc().execute({ now, random: () => 0 });
    scheduler.jobs[0]!.status = "completed";
    pollQuery.setCompletedAt(scheduler.jobs[0]!.id, now);
    const actor = {
      userId: "admin-1",
      role: "admin" as const,
      propertyIds: null,
      isSuperAdmin: true,
    };
    const manual = await enqueuePoll.execute(
      { tenantId: TENANT, connectionId: CONNECTION, now },
      actor,
    );
    expect(manual.isSuccess).toBe(true);
    expect(manual.getValue().job.idempotencyKey).toBe(
      buildManualPollIdempotencyKey(TENANT, CONNECTION, bucket),
    );
    expect(
      scheduler.jobs.filter((j) => j.jobType === POLL_CHANNEL_CONNECTION_JOB_TYPE),
    ).toHaveLength(2);
  });

  it("dead_letter recovery uses recovery:{deadLetterJobId} and converges", async () => {
    await scheduleUc().execute({ now, random: () => 0 });
    const dl = scheduler.jobs[0]!;
    dl.status = "dead_letter";
    const actor = {
      userId: "admin-1",
      role: "admin" as const,
      propertyIds: null,
      isSuperAdmin: true,
    };
    const [a, b] = await Promise.all([
      enqueuePoll.execute({ tenantId: TENANT, connectionId: CONNECTION, now }, actor),
      enqueuePoll.execute({ tenantId: TENANT, connectionId: CONNECTION, now }, actor),
    ]);
    expect(a.isSuccess && b.isSuccess).toBe(true);
    expect(a.getValue().job.id).toBe(b.getValue().job.id);
    expect(a.getValue().job.idempotencyKey).toBe(
      buildRecoveryPollIdempotencyKey(TENANT, CONNECTION, dl.id),
    );
  });

  it("default interval is 15m and resolve clamps below 5m", () => {
    expect(resolveIcalPollIntervalMs(undefined)).toBe(INTERVAL);
    expect(resolveIcalPollIntervalMs("60000")).toBe(5 * 60 * 1000);
  });
});

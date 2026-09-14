import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { ChannelListingMapping } from "../../src/channels/domain/ChannelListingMapping";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelListingMappingRepository } from "../../src/channels/repositories/InMemoryChannelListingMappingRepository";
import { InMemoryChannelPollCursorRepository } from "../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import { InMemoryChannelPollJobQuery } from "../../src/channels/repositories/InMemoryChannelPollJobQuery";
import { InMemoryChannelConnectionHealthQuery } from "../../src/channels/repositories/InMemoryChannelConnectionHealthQuery";
import { InMemoryIcalCredentialRotationStore } from "../../src/channels/repositories/InMemoryIcalCredentialRotationStore";
import { GetChannelConnectionHealthUseCase } from "../../src/channels/application/GetChannelConnectionHealthUseCase";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import type { ActorContext } from "../../src/shared/services/PermissionChecker";
import type { BackgroundJobEntry } from "../../src/shared/types/index";
import { POLL_CHANNEL_CONNECTION_JOB_TYPE } from "../../src/platform/async/jobs/types/JobTypes";
import { ForbiddenError } from "../../src/shared/errors/DomainError";

const TENANT = "tenant-health";
const CONNECTION = "conn-health";
const INTERVAL = 15 * 60 * 1000;

const actor: ActorContext = {
  userId: "admin-1",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: true,
};

describe("P1-S7b GetChannelConnectionHealthUseCase", () => {
  let connections: InMemoryChannelConnectionRepository;
  let mappings: InMemoryChannelListingMappingRepository;
  let cursors: InMemoryChannelPollCursorRepository;
  let jobs: BackgroundJobEntry[];
  let pollQuery: InMemoryChannelPollJobQuery;
  let previousInterval: string | undefined;
  let previousApply: string | undefined;

  beforeEach(async () => {
    previousInterval = process.env.CHANNELS_ICAL_POLL_INTERVAL_MS;
    previousApply = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_ICAL_POLL_INTERVAL_MS = String(INTERVAL);
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";

    connections = new InMemoryChannelConnectionRepository();
    mappings = new InMemoryChannelListingMappingRepository();
    cursors = new InMemoryChannelPollCursorRepository();
    jobs = [];
    pollQuery = new InMemoryChannelPollJobQuery(() => jobs);

    const connection = ChannelConnection.createDraft({
      id: CONNECTION,
      tenantId: TENANT,
      provider: "ical",
      displayName: "Health",
    });
    connection.attachCredentials(CredentialReference.create("cred_health"));
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

    await mappings.save(
      ChannelListingMapping.createActive({
        id: "map-health",
        tenantId: TENANT,
        connectionId: CONNECTION,
        externalListingId: "ext",
        propertyId: "prop-1",
        unitId: "unit-1",
        syncDirection: "inbound",
      }),
    );
    // Default remains OFF for health fence assertions; enable per-test when needed.
  });

  afterEach(() => {
    if (previousInterval === undefined) delete process.env.CHANNELS_ICAL_POLL_INTERVAL_MS;
    else process.env.CHANNELS_ICAL_POLL_INTERVAL_MS = previousInterval;
    if (previousApply === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previousApply;
  });

  function uc(options?: {
    pendingCount?: number;
    reconcileJob?: {
      id: string;
      status: string;
      attemptCount?: number;
      runAt?: Date;
      nextRetryAt?: Date | null;
      completedAt?: Date | null;
    } | null;
    rotation?: boolean;
    activeChannelImportCount?: number;
  }) {
    const healthQuery = new InMemoryChannelConnectionHealthQuery(
      () => ({
        latest:
          (options?.pendingCount ?? 0) > 0
            ? {
                cursorVersion: 1,
                status: "pending",
                appliedAt: null,
                errorCode: null,
                completeObservedEvidence: true,
              }
            : {
                cursorVersion: 1,
                status: "applied",
                appliedAt: new Date(),
                errorCode: null,
                completeObservedEvidence: true,
              },
        pendingCount: options?.pendingCount ?? 0,
      }),
      () =>
        options?.reconcileJob
          ? {
              id: options.reconcileJob.id,
              status: options.reconcileJob.status,
              attemptCount: options.reconcileJob.attemptCount ?? 0,
              runAt: options.reconcileJob.runAt ?? new Date(),
              nextRetryAt: options.reconcileJob.nextRetryAt ?? null,
              completedAt: options.reconcileJob.completedAt ?? null,
            }
          : options?.reconcileJob === null
            ? null
            : {
                id: "rj-ok",
                status: "completed",
                attemptCount: 1,
                runAt: new Date(),
                nextRetryAt: null,
                completedAt: new Date(),
              },
      () => options?.activeChannelImportCount ?? 0,
    );

    const rotationStore = {
      findInProgressForConnection: async () =>
        options?.rotation ? ({ commandId: "rot-1" } as never) : null,
    } as InMemoryIcalCredentialRotationStore;

    return new GetChannelConnectionHealthUseCase(
      connections,
      mappings,
      cursors,
      pollQuery,
      healthQuery,
      rotationStore,
      new PermissionChecker(),
    );
  }

  it("healthy recent completed poll/reconcile → needsAttention=false", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    jobs.push({
      id: "poll-ok",
      tenantId: TENANT,
      jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
      payload: { connectionId: CONNECTION },
      status: "completed",
      priority: 0,
      runAt: now,
      idempotencyKey: `poll_channel_connection:${TENANT}:${CONNECTION}:sched:1`,
      attemptCount: 1,
      maxAttempts: 5,
      createdAt: now,
    });
    pollQuery.setCompletedAt("poll-ok", now);

    const result = await uc().execute({ tenantId: TENANT, connectionId: CONNECTION, now }, actor);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().needsAttention).toBe(false);
    expect(result.getValue().hasCredentialRef).toBe(true);
    expect(result.getValue().activeMappingCount).toBe(1);
    const json = JSON.stringify(result.getValue());
    expect(json).not.toMatch(/cred_health|feedUrl|BEGIN:VCALENDAR/i);
  });

  it("poll dead_letter → poll_job_dead_letter", async () => {
    jobs.push({
      id: "poll-dl",
      tenantId: TENANT,
      jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
      payload: { connectionId: CONNECTION },
      status: "dead_letter",
      priority: 0,
      runAt: new Date(),
      idempotencyKey: `poll_channel_connection:${TENANT}:${CONNECTION}:sched:1`,
      attemptCount: 5,
      maxAttempts: 5,
      createdAt: new Date(),
    });
    const result = await uc().execute({ tenantId: TENANT, connectionId: CONNECTION }, actor);
    expect(result.getValue().attentionReasons).toContain("poll_job_dead_letter");
  });

  it("reconcile dead_letter → reconcile_job_dead_letter", async () => {
    const result = await uc({
      pendingCount: 1,
      reconcileJob: { id: "rj-dl", status: "dead_letter" },
    }).execute({ tenantId: TENANT, connectionId: CONNECTION }, actor);
    expect(result.getValue().attentionReasons).toContain("reconcile_job_dead_letter");
    // apply OFF: pending_without_runnable is intentional fence freeze, not attention
    expect(result.getValue().attentionReasons).not.toContain(
      "pending_reconciliation_without_runnable_job",
    );
    expect(result.getValue().pilotEligible).toBe(false);
    expect(result.getValue().pilotEligibilityReasons).toContain("reconcile_job_dead_letter");
  });

  it("cancelled reconcile + pending generation → attention", async () => {
    const result = await uc({
      pendingCount: 1,
      reconcileJob: { id: "rj-c", status: "cancelled" },
    }).execute({ tenantId: TENANT, connectionId: CONNECTION }, actor);
    expect(result.getValue().attentionReasons).toContain(
      "reconcile_job_cancelled_with_pending_generation",
    );
    expect(result.getValue().pilotEligible).toBe(false);
    expect(result.getValue().pilotEligibilityReasons).toContain(
      "reconcile_job_cancelled_with_pending_generation",
    );
  });

  it("pending generation no runnable reconcile job → attention only when apply ON", async () => {
    const off = await uc({
      pendingCount: 1,
      reconcileJob: null,
    }).execute({ tenantId: TENANT, connectionId: CONNECTION }, actor);
    expect(off.getValue().attentionReasons).not.toContain(
      "pending_reconciliation_without_runnable_job",
    );
    expect(off.getValue().pilotEligible).toBe(true);

    await connections.setInventoryApplyEnabledForTests(TENANT, CONNECTION, true);
    const on = await uc({
      pendingCount: 1,
      reconcileJob: null,
    }).execute({ tenantId: TENANT, connectionId: CONNECTION }, actor);
    expect(on.getValue().attentionReasons).toContain(
      "pending_reconciliation_without_runnable_job",
    );
    expect(on.getValue().pilotEligible).toBe(false);
  });

  it("poll stale >2x interval → attention", async () => {
    const completedAt = new Date("2026-09-14T10:00:00.000Z");
    const now = new Date(completedAt.getTime() + 2 * INTERVAL + 1);
    jobs.push({
      id: "poll-stale",
      tenantId: TENANT,
      jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
      payload: { connectionId: CONNECTION },
      status: "completed",
      priority: 0,
      runAt: completedAt,
      idempotencyKey: `poll_channel_connection:${TENANT}:${CONNECTION}:sched:1`,
      attemptCount: 1,
      maxAttempts: 5,
      createdAt: completedAt,
    });
    pollQuery.setCompletedAt("poll-stale", completedAt);
    const result = await uc().execute({ tenantId: TENANT, connectionId: CONNECTION, now }, actor);
    expect(result.getValue().attentionReasons).toContain("poll_stale_beyond_2x_interval");
  });

  it("rotation in_progress → attention", async () => {
    const result = await uc({ rotation: true }).execute(
      { tenantId: TENANT, connectionId: CONNECTION },
      actor,
    );
    expect(result.getValue().attentionReasons).toContain("rotation_in_progress");
  });

  it("paused connection → no false stale alert", async () => {
    const live = await connections.findById(TENANT, CONNECTION);
    live!.pause();
    await connections.pauseWithExpectedSemanticVersion(live!, live!.semanticConfigVersion, "active");
    const completedAt = new Date("2026-01-01T00:00:00.000Z");
    jobs.push({
      id: "poll-old",
      tenantId: TENANT,
      jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
      payload: { connectionId: CONNECTION },
      status: "completed",
      priority: 0,
      runAt: completedAt,
      idempotencyKey: `poll_channel_connection:${TENANT}:${CONNECTION}:sched:1`,
      attemptCount: 1,
      maxAttempts: 5,
      createdAt: completedAt,
    });
    pollQuery.setCompletedAt("poll-old", completedAt);
    const result = await uc().execute(
      { tenantId: TENANT, connectionId: CONNECTION, now: new Date() },
      actor,
    );
    expect(result.getValue().attentionReasons).not.toContain("poll_stale_beyond_2x_interval");
  });

  it("wrong tenant / missing permission denied", async () => {
    const manager: ActorContext = {
      userId: "m1",
      role: "manager",
      propertyIds: [],
      isSuperAdmin: false,
    };
    const result = await uc().execute(
      { tenantId: TENANT, connectionId: CONNECTION },
      manager,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("S7c health fields: connection apply OFF does not make pilotEligible false", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    jobs.push({
      id: "poll-ok",
      tenantId: TENANT,
      jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
      payload: { connectionId: CONNECTION },
      status: "completed",
      priority: 0,
      runAt: now,
      idempotencyKey: `poll_channel_connection:${TENANT}:${CONNECTION}:sched:1`,
      attemptCount: 1,
      maxAttempts: 5,
      createdAt: now,
    });
    pollQuery.setCompletedAt("poll-ok", now);

    const result = await uc({ activeChannelImportCount: 3 }).execute(
      { tenantId: TENANT, connectionId: CONNECTION, now },
      actor,
    );
    expect(result.isSuccess).toBe(true);
    const health = result.getValue();
    expect(health.inventoryApplyGloballyEnabled).toBe(true);
    expect(health.inventoryApplyForConnection).toBe(false);
    expect(health.inventoryApplyEffective).toBe(false);
    expect(health.pilotEligible).toBe(true);
    expect(health.pilotEligibilityReasons).toEqual([]);
    expect(health.activeChannelImportCount).toBe(3);
  });

  it("S7c health: global OFF → pilotEligible false with global_inventory_apply_disabled", async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "false";
    const result = await uc().execute(
      { tenantId: TENANT, connectionId: CONNECTION },
      actor,
    );
    expect(result.getValue().inventoryApplyGloballyEnabled).toBe(false);
    expect(result.getValue().pilotEligible).toBe(false);
    expect(result.getValue().pilotEligibilityReasons).toContain(
      "global_inventory_apply_disabled",
    );
  });

  it("S7c health: pending without runnable job does not block pilot while apply OFF", async () => {
    const result = await uc({
      pendingCount: 1,
      reconcileJob: { id: "rj-completed", status: "completed" },
    }).execute({ tenantId: TENANT, connectionId: CONNECTION }, actor);
    expect(result.getValue().attentionReasons).not.toContain(
      "pending_reconciliation_without_runnable_job",
    );
    expect(result.getValue().pilotEligibilityReasons).not.toContain(
      "pending_reconciliation_without_runnable_job",
    );
    expect(result.getValue().pilotEligible).toBe(true);
  });
});

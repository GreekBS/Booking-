import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { ChannelListingMapping } from "../../src/channels/domain/ChannelListingMapping";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { EnableChannelConnectionInventoryApplyUseCase } from "../../src/channels/application/EnableChannelConnectionInventoryApplyUseCase";
import { GetChannelConnectionHealthUseCase } from "../../src/channels/application/GetChannelConnectionHealthUseCase";
import { SweepPendingIcalInventoryReconcileUseCase } from "../../src/channels/application/SweepPendingIcalInventoryReconcileUseCase";
import { EnqueueJobUseCase } from "../../src/platform/async/jobs/application/EnqueueJobUseCase";
import { channelConnectionStatusFinderFromRepository } from "../../src/channels/ports/IChannelConnectionStatusFinder";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelListingMappingRepository } from "../../src/channels/repositories/InMemoryChannelListingMappingRepository";
import { InMemoryChannelPollCursorRepository } from "../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import { InMemoryChannelPollJobQuery } from "../../src/channels/repositories/InMemoryChannelPollJobQuery";
import { InMemoryChannelConnectionHealthQuery } from "../../src/channels/repositories/InMemoryChannelConnectionHealthQuery";
import { InMemoryIcalCredentialRotationStore } from "../../src/channels/repositories/InMemoryIcalCredentialRotationStore";
import { InMemoryChannelConnectionInventoryApplyStore } from "../../src/channels/repositories/InMemoryChannelConnectionInventoryApplyStore";
import { InMemoryChannelInventoryReconciliationApplyStore } from "../../src/channels/repositories/InMemoryChannelInventoryReconciliationApplyStore";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import type { ActorContext } from "../../src/shared/services/PermissionChecker";
import { ConflictError } from "../../src/shared/errors/DomainError";
import type { ChannelInventoryReconciliationRecord } from "../../src/channels/types/ChannelInventoryReconciliation";
import type {
  BackgroundJobEntry,
  EnqueueJobCommand,
  IJobScheduler,
} from "../../src/shared/types/index";
import { collectInventoryApplyEnableEligibilityReasons } from "../../src/channels/application/inventoryApplyEnableEligibility";

const TENANT = "550e8400-e29b-41d4-a716-446655440903";
const CONNECTION = "conn-s7c-elig";
const MAPPING = "map-s7c-elig";
const PROPERTY = "prop-s7c-elig";
const UNIT = "unit-s7c-elig";

const actor: ActorContext = {
  userId: "admin-1",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: true,
};

const audit = { actorId: "admin-1", ipAddress: "127.0.0.1" };

class FakeJobScheduler implements IJobScheduler {
  readonly jobs: BackgroundJobEntry[] = [];
  private seq = 0;

  async schedule(command: EnqueueJobCommand): Promise<BackgroundJobEntry> {
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
      createdAt: new Date(),
    };
    this.jobs.push(job);
    return job;
  }
}

describe("P1-S7c inventory apply enable eligibility closure", () => {
  let connections: InMemoryChannelConnectionRepository;
  let mappings: InMemoryChannelListingMappingRepository;
  let cursors: InMemoryChannelPollCursorRepository;
  let generations: Map<string, ChannelInventoryReconciliationRecord>;
  let reconcileJobs: BackgroundJobEntry[];
  let pendingCount: number;
  let reconcileJob: { id: string; status: string } | null;
  let enableUc: EnableChannelConnectionInventoryApplyUseCase;
  let healthUc: GetChannelConnectionHealthUseCase;
  let previousFlag: string | undefined;

  beforeEach(async () => {
    previousFlag = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";

    connections = new InMemoryChannelConnectionRepository();
    mappings = new InMemoryChannelListingMappingRepository();
    cursors = new InMemoryChannelPollCursorRepository(connections);
    generations = new Map();
    reconcileJobs = [];
    pendingCount = 0;
    reconcileJob = { id: "rj-completed", status: "completed" };

    const reconApply = new InMemoryChannelInventoryReconciliationApplyStore(
      connections,
      mappings,
      () => true,
    );
    const rotationStore = new InMemoryIcalCredentialRotationStore(
      connections,
      cursors,
      reconApply,
    );
    const applyStore = new InMemoryChannelConnectionInventoryApplyStore(
      connections,
      mappings,
      cursors,
      generations,
      rotationStore,
    );
    const pollQuery = new InMemoryChannelPollJobQuery(() => []);
    const healthQuery = new InMemoryChannelConnectionHealthQuery(
      () => ({ latest: null, pendingCount }),
      () =>
        reconcileJob
          ? {
              id: reconcileJob.id,
              status: reconcileJob.status,
              attemptCount: 1,
              runAt: new Date(),
              nextRetryAt: null,
              completedAt: new Date(),
            }
          : null,
    );

    enableUc = new EnableChannelConnectionInventoryApplyUseCase(
      connections,
      mappings,
      pollQuery,
      healthQuery,
      rotationStore,
      applyStore,
      new PermissionChecker(),
    );
    healthUc = new GetChannelConnectionHealthUseCase(
      connections,
      mappings,
      cursors,
      pollQuery,
      healthQuery,
      rotationStore,
      new PermissionChecker(),
    );

    const connection = ChannelConnection.createDraft({
      id: CONNECTION,
      tenantId: TENANT,
      provider: "ical",
      displayName: "S7c elig",
    });
    connection.attachCredentials(CredentialReference.create("cred_s7c_elig"));
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
        id: MAPPING,
        tenantId: TENANT,
        connectionId: CONNECTION,
        externalListingId: "ext",
        propertyId: PROPERTY,
        unitId: UNIT,
        syncDirection: "inbound",
      }),
    );
    await cursors.advanceCursor({
      tenantId: TENANT,
      connectionId: CONNECTION,
      observedSemanticConfigVersion: 2,
      expectedCursorVersion: 0,
      nextPayload: "cursor-v1",
    });
  });

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previousFlag;
  });

  function seedCurrentCursorPending(): void {
    const gen: ChannelInventoryReconciliationRecord = {
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
      semanticConfigVersion: 2,
      mappingId: MAPPING,
      mappingVersion: 1,
      unitId: UNIT,
      propertyId: PROPERTY,
      snapshotHash: "a".repeat(64),
      actionableSnapshot: [],
      completeObservedEvidence: true,
      observedSourceIdentityKeys: [],
      cancelledSourceIdentityKeys: [],
      reconcileStatus: "pending",
      reconcileErrorCode: null,
      createdAt: new Date(),
      appliedAt: null,
    };
    generations.set(`${TENANT}:${CONNECTION}:1`, gen);
    pendingCount = 1;
  }

  it("A — frozen pending (apply OFF, completed DEFER job) → pilotEligible + enable; Sweep recovers", async () => {
    seedCurrentCursorPending();
    reconcileJob = { id: "rj-defer-complete", status: "completed" };

    const health = await healthUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION },
      actor,
    );
    expect(health.isSuccess).toBe(true);
    expect(health.getValue().pilotEligible).toBe(true);
    expect(health.getValue().pilotEligibilityReasons).toEqual([]);

    const enabled = await enableUc.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION,
        expectedSemanticConfigVersion: 2,
      },
      actor,
      audit,
    );
    expect(enabled.isSuccess).toBe(true);

    const scheduler = new FakeJobScheduler();
    const sweep = new SweepPendingIcalInventoryReconcileUseCase(
      {
        listPending: async () => [
          {
            tenantId: TENANT,
            connectionId: CONNECTION,
            cursorVersion: 1,
            semanticConfigVersion: 2,
            mappingId: MAPPING,
            mappingVersion: 1,
          },
        ],
      },
      {
        listJobsForGeneration: async () => reconcileJobs,
      },
      new EnqueueJobUseCase(scheduler),
      channelConnectionStatusFinderFromRepository(connections),
    );
    // After enable, no in-flight job → Sweep enqueues primary
    reconcileJobs = [];
    const swept = await sweep.execute();
    expect(swept.isSuccess).toBe(true);
    expect(swept.getValue().enqueuedPrimary).toBe(1);
    expect(swept.getValue().skippedConnectionApplyOff).toBe(0);
  });

  it("B — dead_letter blocks enable and pilotEligible", async () => {
    seedCurrentCursorPending();
    reconcileJob = { id: "rj-dl", status: "dead_letter" };

    const health = await healthUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION },
      actor,
    );
    expect(health.getValue().pilotEligible).toBe(false);
    expect(health.getValue().pilotEligibilityReasons).toContain("reconcile_job_dead_letter");

    const enabled = await enableUc.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION,
        expectedSemanticConfigVersion: 2,
      },
      actor,
      audit,
    );
    expect(enabled.isFailure).toBe(true);
    expect((enabled.getError() as ConflictError).conflictType).toBe("reconcile_job_dead_letter");
  });

  it("C — cancelled + pending blocks enable and pilotEligible", async () => {
    seedCurrentCursorPending();
    reconcileJob = { id: "rj-cancelled", status: "cancelled" };

    const health = await healthUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION },
      actor,
    );
    expect(health.getValue().pilotEligible).toBe(false);
    expect(health.getValue().pilotEligibilityReasons).toContain(
      "reconcile_job_cancelled_with_pending_generation",
    );

    const enabled = await enableUc.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION,
        expectedSemanticConfigVersion: 2,
      },
      actor,
      audit,
    );
    expect(enabled.isFailure).toBe(true);
    expect((enabled.getError() as ConflictError).conflictType).toBe(
      "reconcile_job_cancelled_with_pending_generation",
    );
  });

  it("D — health/API parity table over representative states", () => {
    const base = {
      globalApplyEnabled: true,
      inventoryApplyForConnection: false,
      status: "active",
      provider: "ical",
      semanticMode: "availability_block_feed",
      hasCredentialRef: true,
      activeMappings: [{ propertyId: PROPERTY, unitId: UNIT }],
      rotationInProgress: false,
      latestPollJobStatus: "completed" as string | null,
      latestReconcileJobStatus: "completed" as string | null,
      pendingReconciliationCount: 0,
    };

    const cases: Array<{
      name: string;
      patch: Partial<typeof base>;
      expectEligible: boolean;
      expectReason?: string;
    }> = [
      {
        name: "healthy apply OFF no pending",
        patch: {},
        expectEligible: true,
      },
      {
        name: "frozen pending + completed reconcile",
        patch: {
          pendingReconciliationCount: 1,
          latestReconcileJobStatus: "completed",
        },
        expectEligible: true,
      },
      {
        name: "frozen pending + null reconcile job",
        patch: {
          pendingReconciliationCount: 1,
          latestReconcileJobStatus: null,
        },
        expectEligible: true,
      },
      {
        name: "dead_letter",
        patch: {
          pendingReconciliationCount: 1,
          latestReconcileJobStatus: "dead_letter",
        },
        expectEligible: false,
        expectReason: "reconcile_job_dead_letter",
      },
      {
        name: "cancelled",
        patch: {
          pendingReconciliationCount: 1,
          latestReconcileJobStatus: "cancelled",
        },
        expectEligible: false,
        expectReason: "reconcile_job_cancelled_with_pending_generation",
      },
      {
        name: "apply ON stuck pending without runnable",
        patch: {
          inventoryApplyForConnection: true,
          pendingReconciliationCount: 1,
          latestReconcileJobStatus: "completed",
        },
        expectEligible: false,
        expectReason: "pending_reconciliation_without_runnable_job",
      },
      {
        name: "global OFF",
        patch: { globalApplyEnabled: false },
        expectEligible: false,
        expectReason: "global_inventory_apply_disabled",
      },
    ];

    for (const row of cases) {
      const reasons = collectInventoryApplyEnableEligibilityReasons({
        ...base,
        ...row.patch,
      });
      const eligible = reasons.length === 0;
      expect(eligible, row.name).toBe(row.expectEligible);
      if (row.expectReason) {
        expect(reasons, row.name).toContain(row.expectReason);
      }
    }
  });
});

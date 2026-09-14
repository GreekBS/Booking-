import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { ChannelListingMapping } from "../../src/channels/domain/ChannelListingMapping";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { ExecuteChannelPollConnectionUseCase } from "../../src/channels/application/ExecuteChannelPollConnectionUseCase";
import { ForceRedrivePendingIcalInventoryReconcileUseCase } from "../../src/channels/application/ForceRedrivePendingIcalInventoryReconcileUseCase";
import {
  SweepPendingIcalInventoryReconcileUseCase,
  type IIcalInventoryReconcileJobQuery,
  type IPendingIcalInventoryReconciliationReader,
} from "../../src/channels/application/SweepPendingIcalInventoryReconcileUseCase";
import { EnqueueJobUseCase } from "../../src/platform/async/jobs/application/EnqueueJobUseCase";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelListingMappingRepository } from "../../src/channels/repositories/InMemoryChannelListingMappingRepository";
import { InMemoryChannelPollCursorRepository } from "../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import { InMemoryChannelPollInventoryCommitStore } from "../../src/channels/repositories/InMemoryChannelPollInventoryCommitStore";
import { InMemoryChannelInventoryReconciliationApplyStore } from "../../src/channels/repositories/InMemoryChannelInventoryReconciliationApplyStore";
import { channelConnectionStatusFinderFromRepository } from "../../src/channels/ports/IChannelConnectionStatusFinder";
import { ConflictError } from "../../src/shared/errors/DomainError";
import type { ChannelInventoryReconciliationRecord } from "../../src/channels/types/ChannelInventoryReconciliation";
import type { ReceiveChannelPollBatchUseCase } from "../../src/channels/application/ReceiveChannelPollBatchUseCase";
import type {
  BackgroundJobEntry,
  EnqueueJobCommand,
  IJobScheduler,
} from "../../src/shared/types/index";

const TENANT = "550e8400-e29b-41d4-a716-446655440901";
const CONNECTION = "conn-s7c-fence";
const MAPPING = "map-s7c-fence";
const PROPERTY = "prop-s7c-fence";
const UNIT = "unit-s7c-fence";

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

  async cancel(): Promise<void> {}
}

function emptySnapshot() {
  return {
    snapshotHash: "a".repeat(64),
    items: [] as const,
    canonicalJson: "[]",
    utf8ByteLength: 2,
    completeObservedEvidence: true as const,
    observedSourceIdentityKeys: [] as string[],
    cancelledSourceIdentityKeys: [] as string[],
  };
}

function pendingGeneration(
  overrides: Partial<ChannelInventoryReconciliationRecord> = {},
): ChannelInventoryReconciliationRecord {
  return {
    tenantId: TENANT,
    connectionId: CONNECTION,
    cursorVersion: 1,
    semanticConfigVersion: 2,
    mappingId: MAPPING,
    mappingVersion: 1,
    unitId: UNIT,
    propertyId: PROPERTY,
    snapshotHash: "a".repeat(64),
    actionableSnapshot: [{ i: "src-a", h: "a".repeat(64), k: 1, s: "2026-09-10", e: "2026-09-13" }],
    completeObservedEvidence: false,
    observedSourceIdentityKeys: null,
    cancelledSourceIdentityKeys: null,
    reconcileStatus: "pending",
    reconcileErrorCode: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    appliedAt: null,
    ...overrides,
  };
}

describe("P1-S7c inventory apply fence (global + connection)", () => {
  let connections: InMemoryChannelConnectionRepository;
  let mappings: InMemoryChannelListingMappingRepository;
  let cursors: InMemoryChannelPollCursorRepository;
  let commitStore: InMemoryChannelPollInventoryCommitStore;
  let applyStore: InMemoryChannelInventoryReconciliationApplyStore;
  let previousFlag: string | undefined;

  async function seedConnection(options?: { connectionApply?: boolean }) {
    const connection = ChannelConnection.createDraft({
      id: CONNECTION,
      tenantId: TENANT,
      provider: "ical",
      displayName: "S7c fence",
    });
    connection.attachCredentials(CredentialReference.create("cred_s7c_fence"));
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
    if (options?.connectionApply === true) {
      await connections.setInventoryApplyEnabledForTests(TENANT, CONNECTION, true);
    }
  }

  beforeEach(() => {
    previousFlag = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    connections = new InMemoryChannelConnectionRepository();
    mappings = new InMemoryChannelListingMappingRepository();
    cursors = new InMemoryChannelPollCursorRepository(connections);
    commitStore = new InMemoryChannelPollInventoryCommitStore(
      connections,
      mappings,
      cursors,
      () => process.env.CHANNELS_INVENTORY_APPLY_ENABLED === "true",
    );
    applyStore = new InMemoryChannelInventoryReconciliationApplyStore(
      connections,
      mappings,
      () => process.env.CHANNELS_INVENTORY_APPLY_ENABLED === "true",
    );
  });

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previousFlag;
  });

  it("default connection apply is OFF after create", async () => {
    await seedConnection();
    const live = await connections.findById(TENANT, CONNECTION);
    expect(live?.inventoryApplyEnabled).toBe(false);
  });

  it("global OFF + connection OFF → no inventory apply (cursor-only poll)", async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "false";
    await seedConnection({ connectionApply: false });

    const pollBatchUseCase = {
      execute: vi.fn().mockResolvedValue({
        ackAllowed: true,
        results: [],
        proposedNextCursor: "cursor-off-off",
        inventoryActionableSnapshot: emptySnapshot(),
        inventoryProjectionFailureCode: null,
      }),
    } as unknown as ReceiveChannelPollBatchUseCase;

    const result = await new ExecuteChannelPollConnectionUseCase(
      connections,
      cursors,
      pollBatchUseCase,
      commitStore,
    ).execute({ tenantId: TENANT, connectionId: CONNECTION });

    expect(result.cursorAdvanced).toBe(true);
    expect(commitStore.generations.size).toBe(0);
    expect(commitStore.outbox).toHaveLength(0);

    applyStore.seedGeneration(pendingGeneration());
    const deferred = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(deferred.ok).toBe(true);
    if (!deferred.ok) return;
    expect(deferred.execution).toBe("DEFER");
    expect(deferred.deferReason).toBe("inventory_apply_disabled");
  });

  it("global OFF + connection ON → no inventory apply", async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "false";
    await seedConnection({ connectionApply: true });

    const pollBatchUseCase = {
      execute: vi.fn().mockResolvedValue({
        ackAllowed: true,
        results: [],
        proposedNextCursor: "cursor-off-on",
        inventoryActionableSnapshot: emptySnapshot(),
        inventoryProjectionFailureCode: null,
      }),
    } as unknown as ReceiveChannelPollBatchUseCase;

    const result = await new ExecuteChannelPollConnectionUseCase(
      connections,
      cursors,
      pollBatchUseCase,
      commitStore,
    ).execute({ tenantId: TENANT, connectionId: CONNECTION });

    expect(result.cursorAdvanced).toBe(true);
    expect(commitStore.generations.size).toBe(0);

    applyStore.seedGeneration(pendingGeneration());
    const deferred = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(deferred.ok).toBe(true);
    if (!deferred.ok) return;
    expect(deferred.execution).toBe("DEFER");
  });

  it("global ON + connection OFF → polling/cursor works, no generation", async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    await seedConnection({ connectionApply: false });

    const pollBatchUseCase = {
      execute: vi.fn().mockResolvedValue({
        ackAllowed: true,
        results: [],
        proposedNextCursor: "cursor-on-off",
        inventoryActionableSnapshot: emptySnapshot(),
        inventoryProjectionFailureCode: null,
      }),
    } as unknown as ReceiveChannelPollBatchUseCase;

    const result = await new ExecuteChannelPollConnectionUseCase(
      connections,
      cursors,
      pollBatchUseCase,
      commitStore,
    ).execute({ tenantId: TENANT, connectionId: CONNECTION });

    expect(result.cursorAdvanced).toBe(true);
    expect(result.committedCursorVersion).toBe(1);
    expect((await cursors.getCursor(TENANT, CONNECTION))?.payload).toBe("cursor-on-off");
    expect(commitStore.generations.size).toBe(0);
    expect(commitStore.outbox).toHaveLength(0);
  });

  it("global ON + connection ON → generation/apply path selected", async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    await seedConnection({ connectionApply: true });

    const pollBatchUseCase = {
      execute: vi.fn().mockResolvedValue({
        ackAllowed: true,
        results: [],
        proposedNextCursor: "cursor-on-on",
        inventoryActionableSnapshot: emptySnapshot(),
        inventoryProjectionFailureCode: null,
      }),
    } as unknown as ReceiveChannelPollBatchUseCase;

    const result = await new ExecuteChannelPollConnectionUseCase(
      connections,
      cursors,
      pollBatchUseCase,
      commitStore,
    ).execute({ tenantId: TENANT, connectionId: CONNECTION });

    expect(result.cursorAdvanced).toBe(true);
    expect(commitStore.generations.size).toBe(1);
    expect([...commitStore.generations.values()][0]?.reconcileStatus).toBe("pending");
    expect(commitStore.outbox).toHaveLength(1);

    applyStore.seedGeneration(pendingGeneration());
    const applied = await applyStore.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.execution).toBe("APPLY");
  });

  it("Sweep skips connection apply OFF (skippedConnectionApplyOff)", async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    await seedConnection({ connectionApply: false });

    const logs: Record<string, unknown>[] = [];
    const reader: IPendingIcalInventoryReconciliationReader = {
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
    };
    const jobQuery: IIcalInventoryReconcileJobQuery = {
      listJobsForGeneration: async () => [],
    };
    const scheduler = new FakeJobScheduler();
    const sweep = new SweepPendingIcalInventoryReconcileUseCase(
      reader,
      jobQuery,
      new EnqueueJobUseCase(scheduler),
      channelConnectionStatusFinderFromRepository(connections),
      (fields) => logs.push(fields),
    );

    const swept = await sweep.execute();
    expect(swept.isSuccess).toBe(true);
    expect(swept.getValue().skippedConnectionApplyOff).toBe(1);
    expect(swept.getValue().enqueuedPrimary).toBe(0);
    expect(scheduler.jobs).toHaveLength(0);
    expect(logs).toContainEqual(
      expect.objectContaining({
        action: "channels.ical_inventory_reconcile_skipped",
        reasonCode: "connection_inventory_apply_disabled",
      }),
    );
  });

  it("ForceRedrive rejects connection apply OFF", async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    await seedConnection({ connectionApply: false });

    const force = new ForceRedrivePendingIcalInventoryReconcileUseCase(
      { listJobsForGeneration: async () => [] },
      new EnqueueJobUseCase(new FakeJobScheduler()),
      async () => ({
        tenantId: TENANT,
        connectionId: CONNECTION,
        cursorVersion: 1,
        semanticConfigVersion: 2,
        mappingId: MAPPING,
        mappingVersion: 1,
      }),
      channelConnectionStatusFinderFromRepository(connections),
    );

    const result = await force.execute({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
    expect((result.getError() as ConflictError).conflictType).toBe(
      "connection_inventory_apply_disabled",
    );
  });
});

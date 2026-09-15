import { describe, expect, it, beforeEach } from "vitest";
import { ChannelConnection } from "../../../../src/channels/domain/ChannelConnection";
import { ChannelListingMapping } from "../../../../src/channels/domain/ChannelListingMapping";
import { CredentialReference } from "../../../../src/channels/domain/value-objects/CredentialReference";
import { InMemoryChannelConnectionRepository } from "../../../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelListingMappingRepository } from "../../../../src/channels/repositories/InMemoryChannelListingMappingRepository";
import { InMemoryChannelInventoryReconciliationApplyStore } from "../../../../src/channels/repositories/InMemoryChannelInventoryReconciliationApplyStore";
import { ReconcileIcalImportedInventoryUseCase } from "../../../../src/channels/application/ReconcileIcalImportedInventoryUseCase";
import { IcalInventoryReconcileOutboxHandler } from "../../../../src/channels/application/IcalInventoryReconcileOutboxHandler";
import {
  SweepPendingIcalInventoryReconcileUseCase,
  type IIcalInventoryReconcileJobQuery,
  type IPendingIcalInventoryReconciliationReader,
  type PendingInventoryReconciliationRef,
} from "../../../../src/channels/application/SweepPendingIcalInventoryReconcileUseCase";
import { ForceRedrivePendingIcalInventoryReconcileUseCase } from "../../../../src/channels/application/ForceRedrivePendingIcalInventoryReconcileUseCase";
import { PermissionChecker } from "../../../../src/shared/services/PermissionChecker";
import type { IAuditLogRepository } from "../../../../src/shared/ports/InfrastructurePorts";
import type { ActorContext } from "../../../../src/shared/services/PermissionChecker";
import type { UseCaseAuditContext } from "../../../../src/shared/types/AuditContext";
import {
  buildIcalInventoryReconcilePrimaryJobKey,
  buildIcalInventoryReconcileSuccessorJobKey,
  isIcalInventoryReconcileJobKey,
} from "../../../../src/channels/providers/ical/inventory/icalInventoryReconcileJobIdentity";
import { RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE } from "../../../../src/platform/async/jobs/types/JobTypes";
import { ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE } from "../../../../src/channels/providers/ical/inventory/icalInventoryReconcileOutboxIdentity";
import { projectDesiredChannelImportBlocks } from "../../../../src/channels/providers/ical/inventory/projectDesiredChannelImportBlocks";
import type { ChannelInventoryReconciliationRecord } from "../../../../src/channels/types/ChannelInventoryReconciliation";
import { EnqueueJobUseCase } from "../../../../src/platform/async/jobs/application/EnqueueJobUseCase";
import { LoggingHandler } from "../../../../src/platform/async/handlers/LoggingHandler";
import { OutboxHandlerRegistry } from "../../../../src/platform/async/handlers/OutboxHandlerRegistry";
import type {
  BackgroundJobEntry,
  EnqueueJobCommand,
  IJobScheduler,
  OutboxEntry,
} from "../../../../src/shared/types/index";
import { AvailabilityEvaluator } from "../../../../src/commerce/availability/AvailabilityEvaluator";
import { StayPeriod } from "../../../../src/commerce/shared/value-objects/StayPeriod";
import { LocalDate } from "../../../../src/commerce/shared/value-objects/LocalDate";
import { GuestCount } from "../../../../src/commerce/shared/value-objects/GuestCount";
import { defaultAvailabilityRules } from "../../../commerce/fixtures/commerceFixtures";

const TENANT = "550e8400-e29b-41d4-a716-446655440801";
const CONNECTION = "conn-s6b-domain";
const MAPPING = "map-s6b-domain";
const UNIT = "unit-s6b";
const PROPERTY = "prop-s6b";

function hash(): string {
  return "a".repeat(64);
}

function compactItem(
  i: string,
  s = "2026-09-10",
  e = "2026-09-13",
  h = hash(),
): Record<string, unknown> {
  return { i, h, k: 1, s, e };
}

function generation(
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
    snapshotHash: hash(),
    actionableSnapshot: [compactItem("src-a")],
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

describe("P1-S6b projectDesiredChannelImportBlocks", () => {
  it("maps compact DATE snapshot to half-open stays", () => {
    const result = projectDesiredChannelImportBlocks([compactItem("id-a")]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blocks[0]).toMatchObject({
      sourceIdentityKey: "id-a",
      checkIn: "2026-09-10",
      checkOut: "2026-09-13",
      identityKind: "uid_only",
    });
  });

  it("rejects duplicate sourceIdentityKey", () => {
    const item = {
      sourceIdentityKey: "dup",
      entryContentHash: hash(),
      identityKind: "uid_only" as const,
      checkIn: "2026-01-01",
      checkOut: "2026-01-02",
    };
    expect(projectDesiredChannelImportBlocks([item, item]).ok).toBe(false);
  });

  it("rejects identity longer than 324", () => {
    expect(
      projectDesiredChannelImportBlocks([compactItem("X".repeat(325))]).ok,
    ).toBe(false);
  });
});

describe("P1-S6b reconcile job idempotency keys", () => {
  const identity = {
    tenantId: TENANT,
    connectionId: "x".repeat(255),
    cursorVersion: 2147483647,
  };

  it("primary and successor keys are riq + 64 hex and length 68", () => {
    const primary = buildIcalInventoryReconcilePrimaryJobKey(identity);
    const successor = buildIcalInventoryReconcileSuccessorJobKey(
      identity,
      "550e8400-e29b-41d4-a716-446655440702",
    );
    expect(isIcalInventoryReconcileJobKey(primary)).toBe(true);
    expect(isIcalInventoryReconcileJobKey(successor)).toBe(true);
    expect(primary).toHaveLength(68);
    expect(successor).toHaveLength(68);
    expect(primary).toMatch(/^riq:[0-9a-f]{64}$/);
    expect(successor).toMatch(/^riq:[0-9a-f]{64}$/);
    expect(primary).not.toBe(successor);
  });

  it("different predecessors yield different successor keys", () => {
    const a = buildIcalInventoryReconcileSuccessorJobKey(
      identity,
      "550e8400-e29b-41d4-a716-446655440711",
    );
    const b = buildIcalInventoryReconcileSuccessorJobKey(
      identity,
      "550e8400-e29b-41d4-a716-446655440712",
    );
    expect(a).not.toBe(b);
  });
});

describe("P1-S6b InMemory TX2 fences + materialization", () => {
  let connections: InMemoryChannelConnectionRepository;
  let mappings: InMemoryChannelListingMappingRepository;
  let store: InMemoryChannelInventoryReconciliationApplyStore;
  let applyEnabled: boolean;

  async function seedActiveConnection(opts?: {
    paused?: boolean;
    semanticMode?: "availability_block_feed" | "reservation_feed" | "mixed_or_unknown_feed";
  }) {
    const connection = ChannelConnection.createDraft({
      id: CONNECTION,
      tenantId: TENANT,
      provider: "ical",
      displayName: "S6b",
    });
    connection.attachCredentials(CredentialReference.create("cred_s6b"));
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

    if (opts?.semanticMode && opts.semanticMode !== "availability_block_feed") {
      const live = await connections.findById(TENANT, CONNECTION);
      live!.applySemanticModeChange(opts.semanticMode);
      await connections.persistSemanticState({
        tenantId: TENANT,
        connectionId: CONNECTION,
        expectedSemanticConfigVersion: live!.semanticConfigVersion - 1,
        semanticMode: live!.semanticMode,
        semanticConfigVersion: live!.semanticConfigVersion,
        updatedAt: live!.updatedAt,
      });
    }

    if (opts?.paused) {
      const live = await connections.findById(TENANT, CONNECTION);
      live!.pause();
      await connections.pauseWithExpectedSemanticVersion(
        live!,
        live!.semanticConfigVersion,
        "active",
      );
    }

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

    // P1-S7c: TX2 requires connection inventory apply ON (in addition to global flag).
    await connections.setInventoryApplyEnabledForTests(TENANT, CONNECTION, true);
  }

  beforeEach(async () => {
    applyEnabled = true;
    connections = new InMemoryChannelConnectionRepository();
    mappings = new InMemoryChannelListingMappingRepository();
    store = new InMemoryChannelInventoryReconciliationApplyStore(
      connections,
      mappings,
      () => applyEnabled,
    );
  });

  it("applies DATE snapshot and retains missing identity without complete observed evidence", async () => {
    await seedActiveConnection();
    store.seedGeneration(generation());
    store.blocks.set(
      `${TENANT}|${CONNECTION}|2|${MAPPING}|${UNIT}|src-d`,
      {
        id: "blk-stale",
        tenantId: TENANT,
        unitId: UNIT,
        propertyId: PROPERTY,
        blockType: "channel_import",
        status: "active",
        connectionId: CONNECTION,
        semanticConfigVersion: 2,
        mappingId: MAPPING,
        sourceIdentityKey: "src-d",
        entryContentHash: hash(),
        identityKind: "uid_only",
        checkIn: "2026-01-01",
        checkOut: "2026-01-02",
      },
    );

    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.execution).toBe("APPLY");
    expect(result.createdCount).toBe(1);
    expect(result.retainedStaleCount).toBe(1);
    expect(result.deactivatedCount).toBe(0);
    expect(store.blocks.has(`${TENANT}|${CONNECTION}|2|${MAPPING}|${UNIT}|src-d`)).toBe(
      true,
    );
  });

  it("same identity changed dates updates in place", async () => {
    await seedActiveConnection();
    store.seedGeneration(generation());
    await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    store.seedGeneration(
      generation({
        cursorVersion: 2,
        actionableSnapshot: [compactItem("src-a", "2026-09-11", "2026-09-14")],
      }),
    );
    const second = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 2,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.updatedCount).toBe(1);
    const block = store.blocks.get(`${TENANT}|${CONNECTION}|2|${MAPPING}|${UNIT}|src-a`);
    expect(block?.checkIn).toBe("2026-09-11");
    expect(block?.checkOut).toBe("2026-09-14");
  });

  it("never-applied superseded identity is not materialized", async () => {
    await seedActiveConnection();
    store.seedGeneration(
      generation({
        cursorVersion: 1,
        actionableSnapshot: [compactItem("only-in-n")],
        reconcileStatus: "pending",
      }),
    );
    store.seedGeneration(
      generation({
        cursorVersion: 2,
        actionableSnapshot: [compactItem("only-in-n1")],
      }),
    );
    const older = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(older.ok && older.execution).toBe("SUPERSEDE");
    expect(
      [...store.blocks.values()].some((b) => b.sourceIdentityKey === "only-in-n"),
    ).toBe(false);
  });

  it("flag OFF defers and leaves pending", async () => {
    await seedActiveConnection();
    store.seedGeneration(generation());
    applyEnabled = false;
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.ok && result.execution).toBe("DEFER");
    expect(store.getGeneration(TENANT, CONNECTION, 1)?.reconcileStatus).toBe("pending");
  });

  it("inactive connection defers", async () => {
    await seedActiveConnection({ paused: true });
    store.seedGeneration(generation());
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.ok && result.execution).toBe("DEFER");
    expect(result.ok && result.deferReason).toBe("inactive_connection");
  });

  it("connection missing permanently fails", async () => {
    store.seedGeneration(generation());
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.execution).toBe("PERMANENT_FAIL");
    expect(result.code).toBe("connection_not_found");
    expect(store.getGeneration(TENANT, CONNECTION, 1)?.reconcileStatus).toBe("failed");
  });

  it("wrong semantic mode permanently fails", async () => {
    await seedActiveConnection({ semanticMode: "reservation_feed" });
    store.seedGeneration(generation());
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("feed_semantic_mode_not_availability_block");
    expect(store.getGeneration(TENANT, CONNECTION, 1)?.reconcileStatus).toBe("failed");
  });

  it("semanticConfigVersion mismatch supersedes", async () => {
    await seedActiveConnection();
    store.seedGeneration(generation({ semanticConfigVersion: 99 }));
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.ok && result.execution).toBe("SUPERSEDE");
    expect(store.getGeneration(TENANT, CONNECTION, 1)?.reconcileStatus).toBe("superseded");
  });

  it("mappingVersion mismatch supersedes", async () => {
    await seedActiveConnection();
    store.seedGeneration(generation({ mappingVersion: 99 }));
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.ok && result.execution).toBe("SUPERSEDE");
  });

  it("mappingId mismatch supersedes", async () => {
    await seedActiveConnection();
    store.seedGeneration(generation({ mappingId: "other-map" }));
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.ok && result.execution).toBe("SUPERSEDE");
  });

  it("unitId mismatch permanently fails", async () => {
    await seedActiveConnection();
    store.seedGeneration(generation({ unitId: "other-unit" }));
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("unit_id_mismatch");
  });

  it("propertyId mismatch permanently fails", async () => {
    await seedActiveConnection();
    store.seedGeneration(generation({ propertyId: "other-prop" }));
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("property_id_mismatch");
  });

  it("active mapping count 0 permanently fails", async () => {
    await seedActiveConnection();
    mappings.clear();
    store.seedGeneration(generation());
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("mapping_count_invalid");
  });

  it("terminal statuses are NOOP", async () => {
    await seedActiveConnection();
    for (const status of ["applied", "superseded", "failed"] as const) {
      store.seedGeneration(generation({ reconcileStatus: status, cursorVersion: 10 }));
      const result = await store.apply({
        tenantId: TENANT,
        connectionId: CONNECTION,
        cursorVersion: 10,
      });
      expect(result.ok && result.execution).toBe("NOOP");
    }
  });

  it("newer pending supersedes older without materializing", async () => {
    await seedActiveConnection();
    store.seedGeneration(generation({ cursorVersion: 1 }));
    store.seedGeneration(generation({ cursorVersion: 2 }));
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(result.ok && result.execution).toBe("SUPERSEDE");
    expect(store.blocks.size).toBe(0);
  });

  it("successful apply supersedes older pending generations", async () => {
    await seedActiveConnection();
    store.seedGeneration(generation({ cursorVersion: 1 }));
    store.seedGeneration(generation({ cursorVersion: 2 }));
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 2,
    });
    expect(result.ok && result.execution).toBe("APPLY");
    expect(store.getGeneration(TENANT, CONNECTION, 1)?.reconcileStatus).toBe("superseded");
  });

  it("observed fence mismatch permanently fails", async () => {
    await seedActiveConnection();
    store.seedGeneration(generation());
    const result = await store.apply({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
      observedMappingVersion: 999,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invariant_corruption");
  });

  it("use case validates inputs then applies", async () => {
    await seedActiveConnection();
    store.seedGeneration(generation());
    const uc = new ReconcileIcalImportedInventoryUseCase(store);
    const bad = await uc.execute({
      tenantId: "",
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(bad.isFailure).toBe(true);
    const ok = await uc.execute({
      tenantId: TENANT,
      connectionId: CONNECTION,
      cursorVersion: 1,
    });
    expect(ok.isSuccess).toBe(true);
  });
});

describe("P1-S6b availability: channel_import blocks stays", () => {
  const evaluator = new AvailabilityEvaluator();

  it("channel_import alone blocks overlapping stay", () => {
    const result = evaluator.evaluate({
      stayPeriod: StayPeriod.create("2026-09-10", "2026-09-12"),
      guestCount: GuestCount.create(2),
      unitMaxGuests: 4,
      rules: { ...defaultAvailabilityRules, advanceMinDays: 0 },
      activeBlocks: [
        {
          blockType: "channel_import",
          status: "active",
          checkIn: "2026-09-10",
          checkOut: "2026-09-13",
          sourceId: null,
        },
      ],
      propertyLocalToday: LocalDate.create("2026-09-01"),
    });
    expect(result.available).toBe(false);
    expect(result.reasons.some((r) => r.code === "BLOCKED")).toBe(true);
  });

  it("hold and booking blocks still block (unchanged)", () => {
    for (const blockType of ["hold", "booking"] as const) {
      const result = evaluator.evaluate({
        stayPeriod: StayPeriod.create("2026-09-10", "2026-09-12"),
        guestCount: GuestCount.create(2),
        unitMaxGuests: 4,
        rules: { ...defaultAvailabilityRules, advanceMinDays: 0 },
        activeBlocks: [
          {
            blockType,
            status: "active",
            checkIn: "2026-09-10",
            checkOut: "2026-09-13",
            sourceId: "src-1",
          },
        ],
        propertyLocalToday: LocalDate.create("2026-09-01"),
      });
      expect(result.available).toBe(false);
    }
  });
});

describe("P1-S6b outbox handler + sweep + force redrive", () => {
  it("typed outbox handler is selected before LoggingHandler", () => {
    const scheduler = new FakeJobScheduler();
    const registry = new OutboxHandlerRegistry();
    registry.register(new IcalInventoryReconcileOutboxHandler(new EnqueueJobUseCase(scheduler)));
    registry.register(new LoggingHandler());
    const handler = registry.resolve(ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE);
    expect(handler).toBeInstanceOf(IcalInventoryReconcileOutboxHandler);
  });

  it("outbox handler enqueues only (duplicate delivery converges)", async () => {
    const scheduler = new FakeJobScheduler();
    const handler = new IcalInventoryReconcileOutboxHandler(new EnqueueJobUseCase(scheduler));
    const entry: OutboxEntry = {
      id: "obx-1",
      tenantId: TENANT,
      eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
      aggregateType: "ChannelInventoryReconciliation",
      aggregateId: `${CONNECTION}:1`,
      payload: {
        connectionId: CONNECTION,
        cursorVersion: 1,
        semanticConfigVersion: 2,
        mappingId: MAPPING,
        mappingVersion: 1,
      },
      status: "pending",
      attemptCount: 0,
    };
    await handler.handle(entry);
    await handler.handle(entry);
    expect(scheduler.jobs).toHaveLength(1);
    expect(scheduler.jobs[0]!.jobType).toBe(RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE);
    expect(isIcalInventoryReconcileJobKey(scheduler.jobs[0]!.idempotencyKey!)).toBe(true);
  });

  it("sweep: no-job → primary; completed → successor; dead_letter/cancelled stuck; flag OFF no-op", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      const gens: PendingInventoryReconciliationRef[] = [
        {
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
          semanticConfigVersion: 2,
          mappingId: MAPPING,
          mappingVersion: 1,
        },
      ];
      const scheduler = new FakeJobScheduler();
      const enqueue = new EnqueueJobUseCase(scheduler);
      const reader: IPendingIcalInventoryReconciliationReader = {
        listPending: async () => gens,
      };
      const jobQuery: IIcalInventoryReconcileJobQuery = {
        listJobsForGeneration: async () =>
          scheduler.jobs.filter(
            (j) =>
              j.jobType === RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE &&
              j.payload.connectionId === CONNECTION &&
              j.payload.cursorVersion === 1,
          ),
      };
      const sweep = new SweepPendingIcalInventoryReconcileUseCase(
        reader,
        jobQuery,
        enqueue,
        {
          findStatus: async () => "active",
          findRedriveGate: async () => ({
            status: "active",
            inventoryApplyEnabled: true,
          }),
        },
      );

      const first = await sweep.execute();
      expect(first.getValue().enqueuedPrimary).toBe(1);

      scheduler.jobs[0]!.status = "completed";
      const second = await sweep.execute();
      expect(second.getValue().enqueuedSuccessor).toBe(1);

      scheduler.jobs[1]!.status = "dead_letter";
      const third = await sweep.execute();
      expect(third.getValue().enqueuedSuccessor).toBe(0);
      expect(third.getValue().stuckDeadLetter).toBe(1);

      scheduler.jobs[1]!.status = "cancelled";
      const fourth = await sweep.execute();
      expect(fourth.getValue().stuckCancelled).toBe(1);

      process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "false";
      const off = await sweep.execute();
      expect(off.getValue().skippedFlagOff).toBe(true);
      expect(off.getValue().enqueuedPrimary).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
    }
  });

  it("force redrive requires dead_letter/cancelled and converges on successor key", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      const scheduler = new FakeJobScheduler();
      const enqueue = new EnqueueJobUseCase(scheduler);
      const pred = await enqueue.execute({
        tenantId: TENANT,
        jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
        idempotencyKey: buildIcalInventoryReconcilePrimaryJobKey({
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
        }),
        payload: { connectionId: CONNECTION, cursorVersion: 1 },
      });
      const predJob = pred.getValue();
      predJob.status = "dead_letter";

      const permissions = new PermissionChecker();
      const auditLog: IAuditLogRepository = { append: async () => {} };
      const actor: ActorContext = {
        userId: "op-1",
        role: "admin",
        propertyIds: null,
        isSuperAdmin: true,
      };
      const audit: UseCaseAuditContext = { actorId: "op-1", ipAddress: null };
      const force = new ForceRedrivePendingIcalInventoryReconcileUseCase(
        {
          listJobsForGeneration: async () => [predJob],
        },
        enqueue,
        async () => ({
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
          semanticConfigVersion: 2,
          mappingId: MAPPING,
          mappingVersion: 1,
        }),
        {
          findStatus: async () => "active",
          findRedriveGate: async () => ({
            status: "active",
            inventoryApplyEnabled: true,
          }),
        },
        permissions,
        auditLog,
      );

      const [a, b] = await Promise.all([
        force.execute(
          {
            tenantId: TENANT,
            connectionId: CONNECTION,
            cursorVersion: 1,
          },
          actor,
          audit,
        ),
        force.execute(
          {
            tenantId: TENANT,
            connectionId: CONNECTION,
            cursorVersion: 1,
          },
          actor,
          audit,
        ),
      ]);
      expect(a.isSuccess && b.isSuccess).toBe(true);
      expect(a.getValue().jobId).toBe(b.getValue().jobId);
      expect(a.getValue().idempotencyKey).toBe(
        buildIcalInventoryReconcileSuccessorJobKey(
          { tenantId: TENANT, connectionId: CONNECTION, cursorVersion: 1 },
          predJob.id,
        ),
      );

      process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "false";
      const off = await force.execute(
        {
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
        },
        actor,
        audit,
      );
      expect(off.isFailure).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
    }
  });
});

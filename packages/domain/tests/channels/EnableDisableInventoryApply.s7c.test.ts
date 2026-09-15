import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { ChannelListingMapping } from "../../src/channels/domain/ChannelListingMapping";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { EnableChannelConnectionInventoryApplyUseCase } from "../../src/channels/application/EnableChannelConnectionInventoryApplyUseCase";
import { DisableChannelConnectionInventoryApplyUseCase } from "../../src/channels/application/DisableChannelConnectionInventoryApplyUseCase";
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
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "../../src/shared/errors/DomainError";
import type { ChannelInventoryReconciliationRecord } from "../../src/channels/types/ChannelInventoryReconciliation";
import type { BackgroundJobEntry } from "../../src/shared/types/index";

const TENANT = "550e8400-e29b-41d4-a716-446655440902";
const CONNECTION = "conn-s7c-enable";
const MAPPING = "map-s7c-enable";
const PROPERTY = "prop-s7c-enable";
const UNIT = "unit-s7c-enable";

const actor: ActorContext = {
  userId: "admin-1",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: true,
};

const audit = { actorId: "admin-1", ipAddress: "127.0.0.1" };

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
    actionableSnapshot: [],
    completeObservedEvidence: true,
    observedSourceIdentityKeys: [],
    cancelledSourceIdentityKeys: [],
    reconcileStatus: "pending",
    reconcileErrorCode: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    appliedAt: null,
    ...overrides,
  };
}

describe("P1-S7c Enable/DisableChannelConnectionInventoryApplyUseCase", () => {
  let connections: InMemoryChannelConnectionRepository;
  let mappings: InMemoryChannelListingMappingRepository;
  let cursors: InMemoryChannelPollCursorRepository;
  let jobs: BackgroundJobEntry[];
  let generations: Map<string, ChannelInventoryReconciliationRecord>;
  let applyStore: InMemoryChannelConnectionInventoryApplyStore;
  let enableUc: EnableChannelConnectionInventoryApplyUseCase;
  let disableUc: DisableChannelConnectionInventoryApplyUseCase;
  let previousFlag: string | undefined;
  let pendingCount: number;
  let reconcileJob: { id: string; status: string } | null;

  beforeEach(async () => {
    previousFlag = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";

    connections = new InMemoryChannelConnectionRepository();
    mappings = new InMemoryChannelListingMappingRepository();
    cursors = new InMemoryChannelPollCursorRepository(connections);
    jobs = [];
    generations = new Map();
    pendingCount = 0;
    reconcileJob = {
      id: "rj-ok",
      status: "completed",
    };

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
    applyStore = new InMemoryChannelConnectionInventoryApplyStore(
      connections,
      mappings,
      cursors,
      generations,
      rotationStore,
    );

    const pollQuery = new InMemoryChannelPollJobQuery(() => jobs);
    const healthQuery = new InMemoryChannelConnectionHealthQuery(
      () => ({
        latest: null,
        pendingCount,
      }),
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
    disableUc = new DisableChannelConnectionInventoryApplyUseCase(
      connections,
      applyStore,
      new PermissionChecker(),
    );

    const connection = ChannelConnection.createDraft({
      id: CONNECTION,
      tenantId: TENANT,
      provider: "ical",
      displayName: "S7c enable",
    });
    connection.attachCredentials(CredentialReference.create("cred_s7c_enable"));
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
  });

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previousFlag;
  });

  it("enable fails when global inventory apply is OFF", async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "false";
    const result = await enableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 2 },
      actor,
      audit,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
    expect((result.getError() as ConflictError).conflictType).toBe(
      "global_inventory_apply_disabled",
    );
  });

  it("enable fails closed when connection is paused", async () => {
    const live = await connections.findById(TENANT, CONNECTION);
    live!.pause();
    await connections.pauseWithExpectedSemanticVersion(live!, live!.semanticConfigVersion, "active");

    const result = await enableUc.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION,
        expectedSemanticConfigVersion: live!.semanticConfigVersion,
      },
      actor,
      audit,
    );
    expect(result.isFailure).toBe(true);
    expect((result.getError() as ConflictError).conflictType).toBe("connection_not_active");
  });

  it("enable rejects expectedSemanticVersion mismatch", async () => {
    const result = await enableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 99 },
      actor,
      audit,
    );
    expect(result.isFailure).toBe(true);
    expect((result.getError() as ConflictError).conflictType).toBe("semantic_version_conflict");
  });

  it("enable rejects invalid expectedSemanticConfigVersion", async () => {
    const result = await enableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 0 },
      actor,
      audit,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
  });

  it("enable succeeds, writes audit, and is idempotent", async () => {
    const first = await enableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 2 },
      actor,
      audit,
    );
    expect(first.isSuccess).toBe(true);
    expect(first.getValue()).toMatchObject({
      inventoryApplyEnabled: true,
      alreadyEnabled: false,
      semanticConfigVersion: 2,
      supersededPendingCount: 0,
    });
    expect((await connections.findById(TENANT, CONNECTION))?.inventoryApplyEnabled).toBe(true);
    expect(applyStore.auditLog.entries).toContainEqual(
      expect.objectContaining({
        action: "channel.connection.inventory_apply_enabled",
        resourceId: CONNECTION,
      }),
    );

    const second = await enableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 2 },
      actor,
      audit,
    );
    expect(second.isSuccess).toBe(true);
    expect(second.getValue().alreadyEnabled).toBe(true);
  });

  it("enable supersedes stale pending (cursorVersion < committed) and retains current", async () => {
    await cursors.advanceCursor({
      tenantId: TENANT,
      connectionId: CONNECTION,
      observedSemanticConfigVersion: 2,
      expectedCursorVersion: 0,
      nextPayload: "cursor-v2",
    });
    await cursors.advanceCursor({
      tenantId: TENANT,
      connectionId: CONNECTION,
      observedSemanticConfigVersion: 2,
      expectedCursorVersion: 1,
      nextPayload: "cursor-v2-final",
    });
    expect((await cursors.getCursor(TENANT, CONNECTION))?.version).toBe(2);

    const stale = pendingGeneration({ cursorVersion: 1 });
    const current = pendingGeneration({ cursorVersion: 2 });
    generations.set(`${TENANT}:${CONNECTION}:1`, stale);
    generations.set(`${TENANT}:${CONNECTION}:2`, current);

    const result = await enableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 2 },
      actor,
      audit,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().supersededPendingCount).toBe(1);
    expect(generations.get(`${TENANT}:${CONNECTION}:1`)?.reconcileStatus).toBe(
      "superseded",
    );
    expect(generations.get(`${TENANT}:${CONNECTION}:2`)?.reconcileStatus).toBe(
      "pending",
    );
  });

  it("disable succeeds with audit and is idempotent; does not supersede pending", async () => {
    await enableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 2 },
      actor,
      audit,
    );
    const pending = pendingGeneration({ cursorVersion: 1 });
    generations.set(`${TENANT}:${CONNECTION}:1`, pending);

    const first = await disableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 2 },
      actor,
      audit,
    );
    expect(first.isSuccess).toBe(true);
    expect(first.getValue()).toMatchObject({
      inventoryApplyEnabled: false,
      alreadyDisabled: false,
    });
    expect(pending.reconcileStatus).toBe("pending");
    expect(applyStore.auditLog.entries).toContainEqual(
      expect.objectContaining({
        action: "channel.connection.inventory_apply_disabled",
      }),
    );

    const second = await disableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 2 },
      actor,
      audit,
    );
    expect(second.isSuccess).toBe(true);
    expect(second.getValue().alreadyDisabled).toBe(true);
  });

  it("disable rejects expectedSemanticVersion mismatch", async () => {
    await enableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 2 },
      actor,
      audit,
    );
    const result = await disableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 1 },
      actor,
      audit,
    );
    expect(result.isFailure).toBe(true);
    expect((result.getError() as ConflictError).conflictType).toBe("semantic_version_conflict");
  });

  it("enable / disable deny missing permission", async () => {
    const manager: ActorContext = {
      userId: "m1",
      role: "manager",
      propertyIds: [],
      isSuperAdmin: false,
    };
    const enable = await enableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 2 },
      manager,
      audit,
    );
    expect(enable.isFailure).toBe(true);
    expect(enable.getError()).toBeInstanceOf(ForbiddenError);

    const disable = await disableUc.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 2 },
      manager,
      audit,
    );
    expect(disable.isFailure).toBe(true);
    expect(disable.getError()).toBeInstanceOf(ForbiddenError);
  });
});

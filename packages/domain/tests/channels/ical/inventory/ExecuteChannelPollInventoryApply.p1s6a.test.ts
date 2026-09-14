import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelConnection } from "../../../../src/channels/domain/ChannelConnection";
import { ChannelListingMapping } from "../../../../src/channels/domain/ChannelListingMapping";
import { CredentialReference } from "../../../../src/channels/domain/value-objects/CredentialReference";
import { ExecuteChannelPollConnectionUseCase } from "../../../../src/channels/application/ExecuteChannelPollConnectionUseCase";
import { InMemoryChannelConnectionRepository } from "../../../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelListingMappingRepository } from "../../../../src/channels/repositories/InMemoryChannelListingMappingRepository";
import { InMemoryChannelPollCursorRepository } from "../../../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import { InMemoryChannelPollInventoryCommitStore } from "../../../../src/channels/repositories/InMemoryChannelPollInventoryCommitStore";
import type { ReceiveChannelPollBatchUseCase } from "../../../../src/channels/application/ReceiveChannelPollBatchUseCase";
import type { IcalInventoryActionableSnapshot } from "../../../../src/channels/providers/ical/inventory/buildIcalInventoryActionableSnapshot";

describe("P1-S6a ExecuteChannelPollConnectionUseCase inventory apply hook", () => {
  const tenantId = "550e8400-e29b-41d4-a716-446655440020";
  const connectionId = "550e8400-e29b-41d4-a716-446655440021";
  let connections: InMemoryChannelConnectionRepository;
  let mappings: InMemoryChannelListingMappingRepository;
  let cursors: InMemoryChannelPollCursorRepository;
  let commitStore: InMemoryChannelPollInventoryCommitStore;
  let semanticConfigVersion: number;
  let previousFlag: string | undefined;

  beforeEach(async () => {
    previousFlag = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";

    connections = new InMemoryChannelConnectionRepository();
    mappings = new InMemoryChannelListingMappingRepository();
    cursors = new InMemoryChannelPollCursorRepository(connections);
    commitStore = new InMemoryChannelPollInventoryCommitStore(
      connections,
      mappings,
      cursors,
      () => true,
    );

    const connection = ChannelConnection.createDraft({
      id: connectionId,
      tenantId,
      provider: "ical",
      displayName: "S6a poll hook",
    });
    connection.attachCredentials(CredentialReference.create("cred_s6a_hook"));
    connection.activate();
    await connections.create(connection);
    connection.applySemanticModeChange("availability_block_feed");
    await connections.persistSemanticState({
      tenantId,
      connectionId,
      expectedSemanticConfigVersion: 1,
      semanticMode: connection.semanticMode,
      semanticConfigVersion: connection.semanticConfigVersion,
      updatedAt: connection.updatedAt,
    });
    semanticConfigVersion = connection.semanticConfigVersion;
    await connections.setInventoryApplyEnabledForTests(tenantId, connectionId, true);

    await mappings.save(
      ChannelListingMapping.createActive({
        id: "map-s6a-hook",
        tenantId,
        connectionId,
        externalListingId: "ext",
        propertyId: "prop",
        unitId: "unit",
        syncDirection: "inbound",
      }),
    );
  });

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    } else {
      process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previousFlag;
    }
  });

  function emptySnapshot(): IcalInventoryActionableSnapshot {
    return {
      snapshotHash: "a".repeat(64),
      items: [],
      canonicalJson: "[]",
      utf8ByteLength: 2,
      completeObservedEvidence: true,
      observedSourceIdentityKeys: [],
      cancelledSourceIdentityKeys: [],
    };
  }

  function nonemptySnapshot(): IcalInventoryActionableSnapshot {
    const item = {
      sourceIdentityKey: "id1",
      entryContentHash: "b".repeat(64),
      identityKind: "uid_only" as const,
      checkIn: "2026-01-01",
      checkOut: "2026-01-03",
    };
    const canonicalJson = `[{"i":"${item.sourceIdentityKey}","h":"${item.entryContentHash}","k":1,"s":"${item.checkIn}","e":"${item.checkOut}"}]`;
    return {
      snapshotHash: "c".repeat(64),
      items: [item],
      canonicalJson,
      utf8ByteLength: Buffer.byteLength(canonicalJson, "utf8"),
      completeObservedEvidence: true,
      observedSourceIdentityKeys: [item.sourceIdentityKey],
      cancelledSourceIdentityKeys: [],
    };
  }

  it("flag ON with zero messages still runs TX1 baseline (empty snapshot → pending + outbox)", async () => {
    const pollBatchUseCase = {
      execute: vi.fn().mockResolvedValue({
        ackAllowed: true,
        results: [],
        proposedNextCursor: "cursor-baseline",
        inventoryActionableSnapshot: emptySnapshot(),
        inventoryProjectionFailureCode: null,
      }),
    } as unknown as ReceiveChannelPollBatchUseCase;

    const useCase = new ExecuteChannelPollConnectionUseCase(
      connections,
      cursors,
      pollBatchUseCase,
      commitStore,
    );

    const result = await useCase.execute({ tenantId, connectionId });
    expect(result.cursorAdvanced).toBe(true);
    expect(result.committedCursorVersion).toBe(1);
    expect(result.cursorReconciliation).toBe("advanced");
    expect(commitStore.generations.size).toBe(1);
    expect([...commitStore.generations.values()][0]?.reconcileStatus).toBe("pending");
    expect(commitStore.outbox).toHaveLength(1);
    void semanticConfigVersion;
  });

  it("over-limit projection fails closed before CAS (no generation/outbox/cursor)", async () => {
    const pollBatchUseCase = {
      execute: vi.fn().mockResolvedValue({
        ackAllowed: true,
        results: [],
        proposedNextCursor: "cursor-over",
        inventoryActionableSnapshot: null,
        inventoryProjectionFailureCode: "CAPACITY_EXCEEDED",
      }),
    } as unknown as ReceiveChannelPollBatchUseCase;

    const useCase = new ExecuteChannelPollConnectionUseCase(
      connections,
      cursors,
      pollBatchUseCase,
      commitStore,
    );

    const result = await useCase.execute({ tenantId, connectionId });
    expect(result.cursorAdvanced).toBe(false);
    expect(result.committedCursorVersion).toBeNull();
    expect(result.cursorReconciliation).toBe("not_applicable");
    expect(result.errorMessage).toBe("inventory_snapshot_capacity_exceeded");
    expect(await cursors.getCursor(tenantId, connectionId)).toBeNull();
    expect(commitStore.generations.size).toBe(0);
    expect(commitStore.outbox).toHaveLength(0);
  });

  it("flag OFF preserves P1-S5 cursor-only CAS (no generation/outbox)", async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "false";
    const pollBatchUseCase = {
      execute: vi.fn().mockResolvedValue({
        ackAllowed: true,
        results: [],
        proposedNextCursor: "cursor-s5",
        inventoryActionableSnapshot: emptySnapshot(),
        inventoryProjectionFailureCode: null,
      }),
    } as unknown as ReceiveChannelPollBatchUseCase;

    const useCase = new ExecuteChannelPollConnectionUseCase(
      connections,
      cursors,
      pollBatchUseCase,
      commitStore,
    );

    const result = await useCase.execute({ tenantId, connectionId });
    expect(result.cursorAdvanced).toBe(true);
    expect(result.committedCursorVersion).toBe(1);
    expect((await cursors.getCursor(tenantId, connectionId))?.payload).toBe("cursor-s5");
    expect(commitStore.generations.size).toBe(0);
    expect(commitStore.outbox).toHaveLength(0);
  });

  it("OFF→ON same-feed baseline: generation created once; already_committed retry idempotent", async () => {
    const snap = nonemptySnapshot();
    const pollBatchUseCase = {
      execute: vi.fn().mockResolvedValue({
        ackAllowed: true,
        results: [],
        proposedNextCursor: "snapshot-A",
        inventoryActionableSnapshot: snap,
        inventoryProjectionFailureCode: null,
      }),
    } as unknown as ReceiveChannelPollBatchUseCase;

    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "false";
    const useCaseOff = new ExecuteChannelPollConnectionUseCase(
      connections,
      cursors,
      pollBatchUseCase,
      commitStore,
    );
    const off = await useCaseOff.execute({ tenantId, connectionId });
    expect(off.cursorAdvanced).toBe(true);
    expect(off.committedCursorVersion).toBe(1);
    expect(commitStore.generations.size).toBe(0);
    expect(commitStore.outbox).toHaveLength(0);

    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    const useCaseOn = new ExecuteChannelPollConnectionUseCase(
      connections,
      cursors,
      pollBatchUseCase,
      commitStore,
    );
    const on = await useCaseOn.execute({ tenantId, connectionId });
    expect(on.cursorAdvanced).toBe(true);
    expect(on.committedCursorVersion).toBe(2);
    expect(commitStore.generations.size).toBe(1);
    expect([...commitStore.generations.values()][0]?.reconcileStatus).toBe("pending");
    expect(commitStore.outbox).toHaveLength(1);

    // already_committed retry for the same committed payload must not duplicate.
    const retry = await commitStore.commit({
      tenantId,
      connectionId,
      provider: "ical",
      observedSemanticConfigVersion: semanticConfigVersion,
      expectedCursorVersion: 0,
      proposedNextCursor: "snapshot-A",
      inventorySnapshot: snap,
      batch: {
        ackAllowed: true,
        results: [],
        proposedNextCursor: "snapshot-A",
        inventoryActionableSnapshot: snap,
        inventoryProjectionFailureCode: null,
      },
      loadedCursorVersion: 0,
    });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.pollResult.cursorReconciliation).toBe("already_committed");
    expect(retry.pollResult.committedCursorVersion).toBe(2);
    expect(commitStore.generations.size).toBe(1);
    expect(commitStore.outbox).toHaveLength(1);
  });

  it("already_committed with missing generation backfills baseline for committed version", async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    await cursors.advanceCursor({
      tenantId,
      connectionId,
      observedSemanticConfigVersion: semanticConfigVersion,
      expectedCursorVersion: 0,
      nextPayload: "snapshot-A",
    });
    expect(commitStore.generations.size).toBe(0);

    const snap = nonemptySnapshot();
    const result = await commitStore.commit({
      tenantId,
      connectionId,
      provider: "ical",
      observedSemanticConfigVersion: semanticConfigVersion,
      expectedCursorVersion: 0,
      proposedNextCursor: "snapshot-A",
      inventorySnapshot: snap,
      batch: {
        ackAllowed: true,
        results: [],
        proposedNextCursor: "snapshot-A",
        inventoryActionableSnapshot: snap,
        inventoryProjectionFailureCode: null,
      },
      loadedCursorVersion: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pollResult.cursorReconciliation).toBe("already_committed");
    expect(result.pollResult.committedCursorVersion).toBe(1);
    expect(commitStore.generations.size).toBe(1);
    expect([...commitStore.generations.values()][0]?.cursorVersion).toBe(1);
    expect(commitStore.outbox).toHaveLength(1);

    const again = await commitStore.commit({
      tenantId,
      connectionId,
      provider: "ical",
      observedSemanticConfigVersion: semanticConfigVersion,
      expectedCursorVersion: 0,
      proposedNextCursor: "snapshot-A",
      inventorySnapshot: snap,
      batch: {
        ackAllowed: true,
        results: [],
        proposedNextCursor: "snapshot-A",
        inventoryActionableSnapshot: snap,
        inventoryProjectionFailureCode: null,
      },
      loadedCursorVersion: 0,
    });
    expect(again.ok).toBe(true);
    expect(commitStore.generations.size).toBe(1);
    expect(commitStore.outbox).toHaveLength(1);
  });
});

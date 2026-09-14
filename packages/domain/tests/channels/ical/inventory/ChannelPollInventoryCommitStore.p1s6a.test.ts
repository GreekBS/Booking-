import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ChannelConnection } from "../../../../src/channels/domain/ChannelConnection";
import { ChannelListingMapping } from "../../../../src/channels/domain/ChannelListingMapping";
import { CredentialReference } from "../../../../src/channels/domain/value-objects/CredentialReference";
import { InMemoryChannelConnectionRepository } from "../../../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelListingMappingRepository } from "../../../../src/channels/repositories/InMemoryChannelListingMappingRepository";
import { InMemoryChannelPollCursorRepository } from "../../../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import { InMemoryChannelPollInventoryCommitStore } from "../../../../src/channels/repositories/InMemoryChannelPollInventoryCommitStore";
import { isChannelInventoryApplyEnabled } from "../../../../src/channels/application/channelInventoryApplyGate";
import { ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE } from "../../../../src/channels/providers/ical/inventory/icalInventoryReconcileOutboxIdentity";
import type { IcalInventoryActionableSnapshot } from "../../../../src/channels/providers/ical/inventory/buildIcalInventoryActionableSnapshot";
import type { ReceiveChannelPollBatchResult } from "../../../../src/channels/types/ChannelIngressOrchestrationTypes";

function emptyBatch(cursor: string): ReceiveChannelPollBatchResult {
  return {
    ackAllowed: true,
    results: [],
    proposedNextCursor: cursor,
    inventoryActionableSnapshot: null,
    inventoryProjectionFailureCode: null,
  };
}

function snapshot(
  items: IcalInventoryActionableSnapshot["items"] = [],
  options: {
    observedSourceIdentityKeys?: readonly string[];
    cancelledSourceIdentityKeys?: readonly string[];
  } = {},
): IcalInventoryActionableSnapshot {
  const canonicalJson =
    items.length === 0
      ? "[]"
      : `[${items
          .map(
            (item) =>
              `{"i":"${item.sourceIdentityKey}","h":"${item.entryContentHash}","k":1,"s":"${item.checkIn}","e":"${item.checkOut}"}`,
          )
          .join(",")}]`;
  const observedSourceIdentityKeys =
    options.observedSourceIdentityKeys ?? items.map((item) => item.sourceIdentityKey);
  const cancelledSourceIdentityKeys = options.cancelledSourceIdentityKeys ?? [];
  return {
    snapshotHash: "a".repeat(64),
    items,
    canonicalJson,
    utf8ByteLength: Buffer.byteLength(canonicalJson, "utf8"),
    completeObservedEvidence: true,
    observedSourceIdentityKeys,
    cancelledSourceIdentityKeys,
  };
}

describe("P1-S6a InMemoryChannelPollInventoryCommitStore", () => {
  const tenantId = "550e8400-e29b-41d4-a716-446655440010";
  const connectionId = "550e8400-e29b-41d4-a716-446655440011";
  let connections: InMemoryChannelConnectionRepository;
  let mappings: InMemoryChannelListingMappingRepository;
  let cursors: InMemoryChannelPollCursorRepository;
  let store: InMemoryChannelPollInventoryCommitStore;
  let applyFlag: boolean;
  let semanticConfigVersion: number;

  beforeEach(async () => {
    applyFlag = true;
    connections = new InMemoryChannelConnectionRepository();
    mappings = new InMemoryChannelListingMappingRepository();
    cursors = new InMemoryChannelPollCursorRepository(connections);
    store = new InMemoryChannelPollInventoryCommitStore(
      connections,
      mappings,
      cursors,
      () => applyFlag,
    );

    const connection = ChannelConnection.createDraft({
      id: connectionId,
      tenantId,
      provider: "ical",
      displayName: "iCal S6a",
    });
    connection.attachCredentials(CredentialReference.create("cred_s6a"));
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
        id: "map-s6a-1",
        tenantId,
        connectionId,
        externalListingId: "ext-1",
        propertyId: "prop-1",
        unitId: "unit-1",
        syncDirection: "inbound",
      }),
    );
  });

  afterEach(() => {
    applyFlag = false;
  });

  it("empty snapshot advances cursor, creates pending generation + outbox", async () => {
    const result = await store.commit({
      tenantId,
      connectionId,
      provider: "ical",
      observedSemanticConfigVersion: semanticConfigVersion,
      expectedCursorVersion: 0,
      proposedNextCursor: "cursor-v1",
      inventorySnapshot: snapshot([]),
      batch: emptyBatch("cursor-v1"),
      loadedCursorVersion: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pollResult.cursorAdvanced).toBe(true);
    expect(result.pollResult.committedCursorVersion).toBe(1);
    expect(store.generations.size).toBe(1);
    const gen = [...store.generations.values()][0]!;
    expect(gen.reconcileStatus).toBe("pending");
    expect(gen.completeObservedEvidence).toBe(true);
    expect(gen.observedSourceIdentityKeys).toEqual([]);
    expect(store.outbox).toHaveLength(1);
    expect(store.outbox[0]?.eventType).toBe(ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE);
  });

  it("non-empty snapshot creates pending generation + outbox", async () => {
    const result = await store.commit({
      tenantId,
      connectionId,
      provider: "ical",
      observedSemanticConfigVersion: semanticConfigVersion,
      expectedCursorVersion: 0,
      proposedNextCursor: "cursor-v1",
      inventorySnapshot: snapshot([
        {
          sourceIdentityKey: "id1",
          entryContentHash: "b".repeat(64),
          identityKind: "uid_only",
          checkIn: "2026-01-01",
          checkOut: "2026-01-03",
        },
      ]),
      batch: emptyBatch("cursor-v1"),
      loadedCursorVersion: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pollResult.committedCursorVersion).toBe(1);
    const gen = [...store.generations.values()][0]!;
    expect(gen.reconcileStatus).toBe("pending");
    expect(store.outbox).toHaveLength(1);
    expect(store.outbox[0]?.eventType).toBe(ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE);
    expect(store.outbox[0]?.deliveryKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("flag OFF fails closed without generation/outbox", async () => {
    applyFlag = false;
    const result = await store.commit({
      tenantId,
      connectionId,
      provider: "ical",
      observedSemanticConfigVersion: semanticConfigVersion,
      expectedCursorVersion: 0,
      proposedNextCursor: "cursor-v1",
      inventorySnapshot: snapshot([]),
      batch: emptyBatch("cursor-v1"),
      loadedCursorVersion: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("inventory_apply_disabled");
    expect(store.generations.size).toBe(0);
    expect(store.outbox).toHaveLength(0);
    expect(await cursors.getCursor(tenantId, connectionId)).toBeNull();
  });

  it("CAS loser does not create generation or outbox", async () => {
    await cursors.advanceCursor({
      tenantId,
      connectionId,
      observedSemanticConfigVersion: semanticConfigVersion,
      expectedCursorVersion: 0,
      nextPayload: "other",
    });
    const result = await store.commit({
      tenantId,
      connectionId,
      provider: "ical",
      observedSemanticConfigVersion: semanticConfigVersion,
      expectedCursorVersion: 0,
      proposedNextCursor: "cursor-v1",
      inventorySnapshot: snapshot([
        {
          sourceIdentityKey: "id1",
          entryContentHash: "b".repeat(64),
          identityKind: "uid_only",
          checkIn: "2026-01-01",
          checkOut: "2026-01-03",
        },
      ]),
      batch: emptyBatch("cursor-v1"),
      loadedCursorVersion: 0,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("cursor_conflict");
    expect(store.generations.size).toBe(0);
    expect(store.outbox).toHaveLength(0);
    expect(result.pollResult.committedCursorVersion).toBeNull();
  });
});

describe("channelInventoryApplyGate", () => {
  it("defaults to false unless exactly true", () => {
    expect(isChannelInventoryApplyEnabled({})).toBe(false);
    expect(isChannelInventoryApplyEnabled({ CHANNELS_INVENTORY_APPLY_ENABLED: "false" })).toBe(
      false,
    );
    expect(isChannelInventoryApplyEnabled({ CHANNELS_INVENTORY_APPLY_ENABLED: "true" })).toBe(
      true,
    );
  });
});

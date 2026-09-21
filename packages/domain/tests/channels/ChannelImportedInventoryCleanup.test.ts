import { describe, expect, it } from "vitest";
import { ConflictError } from "../../src/shared/errors/DomainError";
import { InMemoryChannelImportedInventoryCleanupStore } from "../../src/channels/repositories/InMemoryChannelImportedInventoryCleanupStore";

const TENANT = "550e8400-e29b-41d4-a716-446655440001";
const CONNECTION_A = "conn-a";
const CONNECTION_B = "conn-b";

describe("ChannelImportedInventoryCleanupStore", () => {
  function setup() {
    const connections = new Map([
      [
        `${TENANT}:${CONNECTION_A}`,
        {
          tenantId: TENANT,
          id: CONNECTION_A,
          status: "disconnected",
          semanticConfigVersion: 3,
        },
      ],
      [
        `${TENANT}:${CONNECTION_B}`,
        {
          tenantId: TENANT,
          id: CONNECTION_B,
          status: "active",
          semanticConfigVersion: 2,
        },
      ],
    ]);
    const blocks = [
      {
        id: "ci-old",
        tenantId: TENANT,
        connectionId: CONNECTION_A,
        blockType: "channel_import",
        status: "active",
        semanticConfigVersion: 1,
      },
      {
        id: "ci-new",
        tenantId: TENANT,
        connectionId: CONNECTION_A,
        blockType: "channel_import",
        status: "active",
        semanticConfigVersion: 3,
      },
      {
        id: "ci-b",
        tenantId: TENANT,
        connectionId: CONNECTION_B,
        blockType: "channel_import",
        status: "active",
        semanticConfigVersion: 2,
      },
      {
        id: "hold-a",
        tenantId: TENANT,
        connectionId: CONNECTION_A,
        blockType: "hold",
        status: "active",
        semanticConfigVersion: null,
      },
      {
        id: "booking-a",
        tenantId: TENANT,
        connectionId: CONNECTION_A,
        blockType: "booking",
        status: "active",
        semanticConfigVersion: null,
      },
    ];
    const store = new InMemoryChannelImportedInventoryCleanupStore(connections, blocks);
    return { connections, blocks, store };
  }

  it("disconnect release frees all connection channel_import epochs only", async () => {
    const { blocks, store } = setup();
    const result = await store.releaseAllForConnection({
      tenantId: TENANT,
      connectionId: CONNECTION_A,
      expectedSemanticConfigVersion: 3,
      reason: "disconnect",
      actorId: "actor-1",
    });
    expect(result.releasedCount).toBe(2);
    expect(blocks.find((b) => b.id === "ci-old")?.status).toBe("released");
    expect(blocks.find((b) => b.id === "ci-new")?.status).toBe("released");
    expect(blocks.find((b) => b.id === "ci-b")?.status).toBe("active");
    expect(blocks.find((b) => b.id === "hold-a")?.status).toBe("active");
    expect(blocks.find((b) => b.id === "booking-a")?.status).toBe("active");
  });

  it("superseded-epoch release keeps current epoch and never touches Hold/Booking/other connections", async () => {
    const { connections, blocks, store } = setup();
    connections.set(`${TENANT}:${CONNECTION_A}`, {
      tenantId: TENANT,
      id: CONNECTION_A,
      status: "paused",
      semanticConfigVersion: 3,
    });
    const result = await store.releaseSupersededEpochs({
      tenantId: TENANT,
      connectionId: CONNECTION_A,
      keepFromSemanticConfigVersion: 3,
      expectedSemanticConfigVersion: 3,
      reason: "superseded_epoch",
      actorId: "actor-1",
    });
    expect(result.releasedCount).toBe(1);
    expect(blocks.find((b) => b.id === "ci-old")?.status).toBe("released");
    expect(blocks.find((b) => b.id === "ci-new")?.status).toBe("active");
    expect(blocks.find((b) => b.id === "ci-b")?.status).toBe("active");
    expect(blocks.find((b) => b.id === "hold-a")?.status).toBe("active");
    expect(blocks.find((b) => b.id === "booking-a")?.status).toBe("active");
  });

  it("stale semantic CAS cannot release newer inventory", async () => {
    const { store } = setup();
    await expect(
      store.releaseAllForConnection({
        tenantId: TENANT,
        connectionId: CONNECTION_A,
        expectedSemanticConfigVersion: 2,
        reason: "disconnect",
        actorId: "actor-1",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

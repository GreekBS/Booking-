import { describe, expect, it, beforeEach } from "vitest";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryDeactivateChannelConnectionInventoryStore } from "../../src/channels/repositories/InMemoryDeactivateChannelConnectionInventoryStore";
import { DeactivateChannelConnectionInventoryUseCase } from "../../src/channels/application/DeactivateChannelConnectionInventoryUseCase";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import type { ActorContext } from "../../src/shared/services/PermissionChecker";
import { ForbiddenError } from "../../src/shared/errors/DomainError";

const TENANT = "tenant-rb";
const CONNECTION = "conn-rb";

const actor: ActorContext = {
  userId: "admin-1",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: true,
};

describe("P1-S7b DeactivateChannelConnectionInventoryUseCase", () => {
  let connections: InMemoryChannelConnectionRepository;
  let blocks: Array<{
    id: string;
    tenantId: string;
    connectionId: string;
    blockType: string;
    status: string;
  }>;
  let store: InMemoryDeactivateChannelConnectionInventoryStore;
  let useCase: DeactivateChannelConnectionInventoryUseCase;

  beforeEach(async () => {
    connections = new InMemoryChannelConnectionRepository();
    blocks = [
      {
        id: "b1",
        tenantId: TENANT,
        connectionId: CONNECTION,
        blockType: "channel_import",
        status: "active",
      },
      {
        id: "b2",
        tenantId: TENANT,
        connectionId: CONNECTION,
        blockType: "channel_import",
        status: "active",
      },
      {
        id: "hold",
        tenantId: TENANT,
        connectionId: CONNECTION,
        blockType: "hold",
        status: "active",
      },
      {
        id: "other",
        tenantId: TENANT,
        connectionId: "other-conn",
        blockType: "channel_import",
        status: "active",
      },
    ];
    store = new InMemoryDeactivateChannelConnectionInventoryStore(connections, blocks);
    useCase = new DeactivateChannelConnectionInventoryUseCase(
      connections,
      store,
      new PermissionChecker(),
    );

    const connection = ChannelConnection.createDraft({
      id: CONNECTION,
      tenantId: TENANT,
      provider: "ical",
      displayName: "RB",
    });
    connection.attachCredentials(CredentialReference.create("cred_rb"));
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
  });

  it("pauses active connection and releases all target channel_import", async () => {
    const result = await useCase.execute(
      { tenantId: TENANT, connectionId: CONNECTION },
      actor,
      { actorId: "admin-1", ipAddress: null },
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toMatchObject({
      connectionStatus: "paused",
      releasedCount: 2,
      alreadyPaused: false,
    });
    expect(blocks.find((b) => b.id === "b1")!.status).toBe("released");
    expect(blocks.find((b) => b.id === "hold")!.status).toBe("active");
    expect(blocks.find((b) => b.id === "other")!.status).toBe("active");
    expect(store.audits).toHaveLength(1);
  });

  it("repeat rollback is idempotent", async () => {
    await useCase.execute(
      { tenantId: TENANT, connectionId: CONNECTION },
      actor,
      { actorId: "admin-1", ipAddress: null },
    );
    const second = await useCase.execute(
      { tenantId: TENANT, connectionId: CONNECTION },
      actor,
      { actorId: "admin-1", ipAddress: null },
    );
    expect(second.isSuccess).toBe(true);
    expect(second.getValue()).toMatchObject({
      connectionStatus: "paused",
      releasedCount: 0,
      alreadyPaused: true,
    });
  });

  it("rejects forbidden actor", async () => {
    const manager: ActorContext = {
      userId: "m1",
      role: "manager",
      propertyIds: [],
      isSuperAdmin: false,
    };
    const result = await useCase.execute(
      { tenantId: TENANT, connectionId: CONNECTION },
      manager,
      { actorId: "m1", ipAddress: null },
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });
});

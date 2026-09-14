import { beforeEach, describe, expect, it } from "vitest";
import {
  CreateChannelConnectionUseCase,
  GetChannelConnectionUseCase,
  ListChannelConnectionsUseCase,
  UpdateChannelConnectionMetadataUseCase,
  PutChannelConnectionCredentialsUseCase,
  PutChannelConnectionWebhookVerificationUseCase,
  PauseChannelConnectionUseCase,
  DisconnectChannelConnectionUseCase,
  ChannelConnection,
  CredentialReference,
  ForbiddenError,
  InMemoryChannelConnectionLifecycleUnitOfWork,
  InMemoryChannelConnectionRepository,
  InMemoryChannelCredentialVault,
  InMemoryLifecycleAuditLog,
  NotFoundError,
  PermissionChecker,
  ValidationError,
} from "../../src";

const TENANT_A = "550e8400-e29b-41d4-a716-446655440900";
const TENANT_B = "550e8400-e29b-41d4-a716-446655440901";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440902";
const ACTOR_ID = "550e8400-e29b-41d4-a716-446655440903";

function adminActor() {
  return {
    userId: ACTOR_ID,
    role: "admin" as const,
    propertyIds: null as null,
  };
}

function managerActor() {
  return {
    userId: ACTOR_ID,
    role: "manager" as const,
    propertyIds: ["prop-1"],
  };
}

describe("CM-4b S4a-1 operator foundation use cases", () => {
  const connections = new InMemoryChannelConnectionRepository();
  const audit = new InMemoryLifecycleAuditLog();
  const vault = new InMemoryChannelCredentialVault();
  const permissionChecker = new PermissionChecker();
  const uow = new InMemoryChannelConnectionLifecycleUnitOfWork(connections, audit);

  const create = new CreateChannelConnectionUseCase(
    connections,
    permissionChecker,
    { generate: () => CONNECTION_ID },
    audit,
  );
  const list = new ListChannelConnectionsUseCase(connections, permissionChecker);
  const get = new GetChannelConnectionUseCase(connections, permissionChecker);
  const updateMeta = new UpdateChannelConnectionMetadataUseCase(
    connections,
    permissionChecker,
    audit,
  );
  const putCreds = new PutChannelConnectionCredentialsUseCase(
    connections,
    vault,
    permissionChecker,
    audit,
  );
  const putWebhook = new PutChannelConnectionWebhookVerificationUseCase(
    connections,
    vault,
    permissionChecker,
    audit,
  );
  const pause = new PauseChannelConnectionUseCase(connections, permissionChecker, uow);
  const disconnect = new DisconnectChannelConnectionUseCase(
    connections,
    permissionChecker,
    uow,
  );

  beforeEach(() => {
    connections.clear();
    audit.clear();
    vault.clear();
  });

  it("creates draft connections with immutable provider", async () => {
    const result = await create.execute(
      {
        tenantId: TENANT_A,
        provider: "booking_com",
        displayName: " Booking.com main ",
      },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.status).toBe("draft");
    expect(value.provider).toBe("booking_com");
    expect(value.displayName).toBe("Booking.com main");
    expect(value.hasCredentialRef).toBe(false);
    expect(value.semanticMode).toBe("mixed_or_unknown_feed");
    expect(value.semanticConfigVersion).toBe(1);
  });

  it("lists and gets only within tenant", async () => {
    await create.execute(
      { tenantId: TENANT_A, provider: "manual", displayName: "A" },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    const other = ChannelConnection.createDraft({
      id: "550e8400-e29b-41d4-a716-446655440999",
      tenantId: TENANT_B,
      provider: "manual",
      displayName: "B",
    });
    await connections.create(other);

    const listed = await list.execute({ tenantId: TENANT_A }, adminActor());
    expect(listed.getValue()).toHaveLength(1);
    expect(listed.getValue()[0]?.tenantId).toBe(TENANT_A);

    const cross = await get.execute(
      { tenantId: TENANT_A, connectionId: other.id },
      adminActor(),
    );
    expect(cross.isFailure).toBe(true);
    expect(cross.getError()).toBeInstanceOf(NotFoundError);
  });

  it("updates displayName only (metadata boundary)", async () => {
    await create.execute(
      { tenantId: TENANT_A, provider: "airbnb", displayName: "Old" },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    const before = (await connections.findById(TENANT_A, CONNECTION_ID))!;
    const mode = before.semanticMode;
    const version = before.semanticConfigVersion;
    const status = before.status;

    const updated = await updateMeta.execute(
      { tenantId: TENANT_A, connectionId: CONNECTION_ID, displayName: "New name" },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    expect(updated.getValue().displayName).toBe("New name");
    expect(updated.getValue().provider).toBe("airbnb");
    expect(updated.getValue().status).toBe(status);
    expect(updated.getValue().semanticMode).toBe(mode);
    expect(updated.getValue().semanticConfigVersion).toBe(version);
  });

  it("attaches credentials without exposing secrets in read model or audit", async () => {
    await create.execute(
      { tenantId: TENANT_A, provider: "manual", displayName: "Creds" },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );

    const secret = "super-secret-token-value";
    const result = await putCreds.execute(
      {
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        material: { apiKey: secret },
      },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().status).toBe("pending_auth");
    expect(result.getValue().hasCredentialRef).toBe(true);
    expect(JSON.stringify(result.getValue())).not.toContain(secret);

    const lastAudit = audit.entries.at(-1);
    expect(lastAudit?.action).toBe("channel.connection.credentials_attached");
    expect(JSON.stringify(lastAudit)).not.toContain(secret);
  });

  it("rotates credentials without lifecycle status change when pending_auth+", async () => {
    const connection = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_A,
      provider: "manual",
      displayName: "Rotate",
    });
    connection.attachCredentials(CredentialReference.create("prior-ref"));
    await connections.create(connection);

    const result = await putCreds.execute(
      {
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        material: { apiKey: "rotated" },
      },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    expect(result.getValue().status).toBe("pending_auth");
    expect(audit.entries.at(-1)?.action).toBe("channel.connection.credentials_rotated");
  });

  it("stores webhook verification as opaque ref only", async () => {
    await create.execute(
      { tenantId: TENANT_A, provider: "manual", displayName: "Hook" },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    const secret = "whsec_live_abc123";
    const result = await putWebhook.execute(
      { tenantId: TENANT_A, connectionId: CONNECTION_ID, secret },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    expect(result.getValue().hasWebhookVerificationRef).toBe(true);
    expect(JSON.stringify(result.getValue())).not.toContain(secret);
  });

  it("pauses active connection under semantic CAS", async () => {
    const connection = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_A,
      provider: "manual",
      displayName: "Active",
    });
    connection.attachCredentials(CredentialReference.create("cred"));
    await connections.create(connection);
    await connections.persistSemanticState({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      expectedSemanticConfigVersion: 1,
      semanticMode: "mixed_or_unknown_feed",
      semanticConfigVersion: 3,
      updatedAt: new Date(),
    });
    const pending = (await connections.findById(TENANT_A, CONNECTION_ID))!;
    await connections.activateWithExpectedSemanticVersion(
      ChannelConnection.reconstitute({
        ...pending.toProps(),
        status: "active",
      }),
      3,
      "pending_auth",
    );

    const staleVersion = await pause.execute(
      {
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
      },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    expect(staleVersion.isFailure).toBe(true);

    const result = await pause.execute(
      {
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 3,
      },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    expect(result.getValue().status).toBe("paused");
    expect(result.getValue().semanticConfigVersion).toBe(3);
  });

  it("disconnects and clears credential refs without semantic mutation", async () => {
    const connection = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_A,
      provider: "manual",
      displayName: "Disc",
    });
    connection.attachCredentials(CredentialReference.create("cred"));
    await connections.create(connection);
    await connections.persistSemanticState({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      expectedSemanticConfigVersion: 1,
      semanticMode: "availability_block_feed",
      semanticConfigVersion: 2,
      updatedAt: new Date(),
    });
    const pending = (await connections.findById(TENANT_A, CONNECTION_ID))!;
    await connections.pauseWithExpectedSemanticVersion(
      ChannelConnection.reconstitute({
        ...pending.toProps(),
        status: "paused",
      }),
      2,
      "pending_auth",
    );

    const result = await disconnect.execute(
      {
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 2,
      },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    expect(result.getValue().status).toBe("disconnected");
    expect(result.getValue().semanticMode).toBe("availability_block_feed");
    expect(result.getValue().semanticConfigVersion).toBe(2);

    const stored = await connections.findById(TENANT_A, CONNECTION_ID);
    expect(stored?.credentialRef).toBeNull();
    expect(stored?.semanticMode).toBe("availability_block_feed");
  });

  it("rejects missing manage permission", async () => {
    const result = await create.execute(
      { tenantId: TENANT_A, provider: "manual", displayName: "X" },
      managerActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("rejects invalid provider", async () => {
    const result = await create.execute(
      {
        tenantId: TENANT_A,
        provider: "not_a_provider" as "manual",
        displayName: "X",
      },
      adminActor(),
      { actorId: ACTOR_ID, ipAddress: null },
    );
    expect(result.getError()).toBeInstanceOf(ValidationError);
  });
});

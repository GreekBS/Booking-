import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ChannelConnection,
  CreateChannelConnectionUseCase,
  PutChannelConnectionCredentialsUseCase,
  PauseChannelConnectionUseCase,
  DisconnectChannelConnectionUseCase,
  UpdateChannelConnectionMetadataUseCase,
  CredentialReference,
  PermissionChecker,
  ConflictError,
} from "@hcp/domain";
import {
  PrismaChannelConnectionLifecycleUnitOfWork,
  PrismaChannelConnectionRepository,
  PrismaChannelCredentialVault,
  PrismaAuditLogRepository,
  setTenantContext,
} from "../../src";
import { prisma } from "./helpers";
import { integrationDatabaseConfigured } from "./integrationGate";

const runIntegration = integrationDatabaseConfigured
  ? (title: string, fn: () => void) =>
      describe(title, { hookTimeout: 120_000, timeout: 120_000 }, fn)
  : describe.skip;

const INTEGRATION_TX_OPTIONS = { maxWait: 20_000, timeout: 60_000 } as const;
const MASTER_KEY = Buffer.alloc(32, 9).toString("base64");

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440940";
const OTHER_TENANT_ID = "550e8400-e29b-41d4-a716-446655440941";
const CONNECTION_ID = "s4a1-pg-connection";
const ACTOR_ID = "550e8400-e29b-41d4-a716-446655440942";

async function seedTenantGraph(): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { actorId: ACTOR_ID } });
  await prisma.channelSecretRecord.deleteMany({
    where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  });
  await prisma.channelConnection.deleteMany({
    where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  });
  await prisma.user.deleteMany({ where: { id: ACTOR_ID } });
  await prisma.tenant.deleteMany({
    where: { id: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  });

  await prisma.tenant.createMany({
    data: [
      { id: TENANT_ID, name: "S4a1 Tenant", slug: "int-s4a1-tenant" },
      { id: OTHER_TENANT_ID, name: "S4a1 Other", slug: "int-s4a1-other" },
    ],
  });
  await prisma.user.create({
    data: { id: ACTOR_ID, email: "s4a1@integration.test", name: "S4a1 Actor" },
  });
}

runIntegration("CM-4b S4a-1 operator foundation PostgreSQL", () => {
  const connections = new PrismaChannelConnectionRepository();
  const audit = new PrismaAuditLogRepository();
  const vault = new PrismaChannelCredentialVault(prisma, MASTER_KEY);
  const uow = new PrismaChannelConnectionLifecycleUnitOfWork(
    prisma,
    INTEGRATION_TX_OPTIONS,
  );
  const permissionChecker = new PermissionChecker();

  const create = new CreateChannelConnectionUseCase(
    connections,
    permissionChecker,
    { generate: () => CONNECTION_ID },
    audit,
  );
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
  const pause = new PauseChannelConnectionUseCase(connections, permissionChecker, uow);
  const disconnect = new DisconnectChannelConnectionUseCase(
    connections,
    permissionChecker,
    uow,
  );

  const adminActor = {
    userId: ACTOR_ID,
    role: "admin" as const,
    propertyIds: null,
  };
  const auditCtx = { actorId: ACTOR_ID, ipAddress: null };

  beforeEach(async () => {
    await seedTenantGraph();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("seals credentials, attaches pending_auth, and resolves without leaking ciphertext in connection row", async () => {
    const secret = "pg-integration-secret-value";
    const created = await create.execute(
      {
        tenantId: TENANT_ID,
        provider: "manual",
        displayName: "S4a1",
      },
      adminActor,
      auditCtx,
    );
    expect(created.isSuccess).toBe(true);

    const attached = await putCreds.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        material: { apiKey: secret },
      },
      adminActor,
      auditCtx,
    );
    expect(attached.getValue().status).toBe("pending_auth");
    expect(attached.getValue().hasCredentialRef).toBe(true);
    expect(JSON.stringify(attached.getValue())).not.toContain(secret);

    const stored = await connections.findById(TENANT_ID, CONNECTION_ID);
    expect(stored?.credentialRef).toBeTruthy();
    expect(stored!.credentialRef!.value).not.toContain(secret);

    await setTenantContext(prisma, TENANT_ID);
    const secretRows = await prisma.channelSecretRecord.findMany({
      where: { tenantId: TENANT_ID },
    });
    expect(secretRows).toHaveLength(1);
    expect(Buffer.from(secretRows[0]!.ciphertext).toString("utf8")).not.toContain(secret);

    const resolved = await vault.resolveCredential(stored!.credentialRef!);
    expect(resolved.material.apiKey).toBe(secret);
  });

  it("metadata update does not change provider, semantics, or status", async () => {
    await create.execute(
      { tenantId: TENANT_ID, provider: "booking_com", displayName: "Old" },
      adminActor,
      auditCtx,
    );
    const updated = await updateMeta.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        displayName: "New",
      },
      adminActor,
      auditCtx,
    );
    expect(updated.getValue().displayName).toBe("New");
    expect(updated.getValue().provider).toBe("booking_com");
    expect(updated.getValue().status).toBe("draft");
    expect(updated.getValue().semanticMode).toBe("mixed_or_unknown_feed");
    expect(updated.getValue().semanticConfigVersion).toBe(1);
  });

  it("pause and disconnect honor semantic CAS and tenant isolation", async () => {
    const connection = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: "manual",
      displayName: "Life",
    });
    connection.attachCredentials(CredentialReference.create("cred-ref"));
    await connections.create(connection);
    await connections.persistSemanticState({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      expectedSemanticConfigVersion: 1,
      semanticMode: "mixed_or_unknown_feed",
      semanticConfigVersion: 4,
      updatedAt: new Date(),
    });
    const pending = (await connections.findById(TENANT_ID, CONNECTION_ID))!;
    await connections.activateWithExpectedSemanticVersion(
      ChannelConnection.reconstitute({
        ...pending.toProps(),
        status: "active",
      }),
      4,
      "pending_auth",
    );

    const stale = await pause.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
      },
      adminActor,
      auditCtx,
    );
    expect(stale.isFailure).toBe(true);
    expect(stale.getError()).toBeInstanceOf(ConflictError);

    const paused = await pause.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 4,
      },
      adminActor,
      auditCtx,
    );
    expect(paused.getValue().status).toBe("paused");

    const cross = await disconnect.execute(
      {
        tenantId: OTHER_TENANT_ID,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 4,
      },
      adminActor,
      auditCtx,
    );
    expect(cross.isFailure).toBe(true);

    const disconnected = await disconnect.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 4,
      },
      adminActor,
      auditCtx,
    );
    expect(disconnected.getValue().status).toBe("disconnected");
    expect(disconnected.getValue().semanticConfigVersion).toBe(4);

    const stored = await connections.findById(TENANT_ID, CONNECTION_ID);
    expect(stored?.credentialRef).toBeNull();
    expect(stored?.semanticMode).toBe("mixed_or_unknown_feed");
  });

  it("repository and vault keep secrets tenant-scoped", async () => {
    await create.execute(
      { tenantId: TENANT_ID, provider: "manual", displayName: "RLS" },
      adminActor,
      auditCtx,
    );
    const attached = await putCreds.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        material: { apiKey: "tenant-a-secret" },
      },
      adminActor,
      auditCtx,
    );
    expect(attached.isSuccess).toBe(true);

    const crossConnection = await connections.findById(OTHER_TENANT_ID, CONNECTION_ID);
    expect(crossConnection).toBeNull();

    const own = await connections.findById(TENANT_ID, CONNECTION_ID);
    expect(own?.credentialRef).toBeTruthy();

    await setTenantContext(prisma, OTHER_TENANT_ID);
    const otherTenantSecrets = await prisma.channelSecretRecord.findMany({
      where: { tenantId: OTHER_TENANT_ID },
    });
    expect(otherTenantSecrets).toHaveLength(0);
  });

  it("missing master key fails closed without inserting a secret row", async () => {
    await create.execute(
      { tenantId: TENANT_ID, provider: "manual", displayName: "NoKey" },
      adminActor,
      auditCtx,
    );
    const brokenVault = new PrismaChannelCredentialVault(prisma, undefined);
    const brokenPut = new PutChannelConnectionCredentialsUseCase(
      connections,
      brokenVault,
      permissionChecker,
      audit,
    );
    const result = await brokenPut.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        material: { apiKey: "must-not-persist" },
      },
      adminActor,
      auditCtx,
    );
    expect(result.isFailure).toBe(true);

    await setTenantContext(prisma, TENANT_ID);
    const rows = await prisma.channelSecretRecord.findMany({
      where: { tenantId: TENANT_ID },
    });
    expect(rows).toHaveLength(0);

    const connection = await connections.findById(TENANT_ID, CONNECTION_ID);
    expect(connection?.credentialRef).toBeNull();
  });

  it("wrong secret kind cannot be resolved as credential", async () => {
    const webhookRef = await vault.putWebhookVerification(TENANT_ID, "whsec");
    await expect(
      vault.resolveCredential(CredentialReference.create(webhookRef.value)),
    ).rejects.toThrow();
  });
});

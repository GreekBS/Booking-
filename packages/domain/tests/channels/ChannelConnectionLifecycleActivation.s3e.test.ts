import { beforeEach, describe, expect, it } from "vitest";
import {
  ActivateChannelConnectionUseCase,
  ResumeChannelConnectionUseCase,
  ChannelConnection,
  ChannelProviderRegistry,
  ConflictError,
  CredentialReference,
  ForbiddenError,
  InMemoryChannelConnectionLifecycleUnitOfWork,
  InMemoryChannelConnectionRepository,
  InMemoryLifecycleAuditLog,
  NotFoundError,
  PermissionChecker,
  ValidationError,
  withDefaultProviderRegistrationPolicies,
  createProviderCapabilities,
  FEED_SEMANTIC_MODES,
  ChannelProviderRegistrationError,
} from "../../src";
import { TestChannelPollingProvider } from "../../src/channels/simulation/TestChannelPollingProvider";
import { PERMISSIONS } from "@hcp/permissions";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440900";
const OTHER_TENANT_ID = "550e8400-e29b-41d4-a716-446655440901";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440902";
const ACTOR_ID = "550e8400-e29b-41d4-a716-446655440903";

function registerFlexibleProvider(registry: ChannelProviderRegistry): void {
  registry.register(
    withDefaultProviderRegistrationPolicies({
      providerId: "manual",
      capabilities: createProviderCapabilities({
        inbound: { polling: true, webhooks: false, reservationImport: false },
      }),
      status: "active",
      auth: null,
      webhooks: null,
      polling: new TestChannelPollingProvider(),
      reservationImport: null,
      availabilityExport: null,
      rateRestrictionExport: null,
      reservationExport: null,
      allowedFeedSemanticModes: [...FEED_SEMANTIC_MODES],
    }),
  );
}

function registerRestrictedProvider(registry: ChannelProviderRegistry): void {
  registry.register(
    withDefaultProviderRegistrationPolicies({
      providerId: "ical",
      capabilities: createProviderCapabilities({
        inbound: { polling: true, webhooks: false, reservationImport: false },
      }),
      status: "active",
      auth: null,
      webhooks: null,
      polling: new TestChannelPollingProvider(),
      reservationImport: null,
      availabilityExport: null,
      rateRestrictionExport: null,
      reservationExport: null,
      allowedFeedSemanticModes: ["mixed_or_unknown_feed", "availability_block_feed"],
    }),
  );
}

describe("CM-4b S3e Activate/Resume ChannelConnection use cases", () => {
  let connections: InMemoryChannelConnectionRepository;
  let auditLog: InMemoryLifecycleAuditLog;
  let unitOfWork: InMemoryChannelConnectionLifecycleUnitOfWork;
  let registry: ChannelProviderRegistry;
  let activate: ActivateChannelConnectionUseCase;
  let resume: ResumeChannelConnectionUseCase;
  const permissionChecker = new PermissionChecker();

  const adminActor = {
    userId: ACTOR_ID,
    role: "admin" as const,
    propertyIds: null,
  };

  const managerActor = {
    userId: "550e8400-e29b-41d4-a716-446655440904",
    role: "manager" as const,
    propertyIds: ["prop-1"],
  };

  const audit = { actorId: ACTOR_ID, ipAddress: "127.0.0.1" };

  async function seedPendingAuth(overrides?: {
    id?: string;
    tenantId?: string;
    provider?: "manual" | "ical";
    mode?: "mixed_or_unknown_feed" | "reservation_feed" | "availability_block_feed";
  }): Promise<void> {
    const connection = ChannelConnection.createDraft({
      id: overrides?.id ?? CONNECTION_ID,
      tenantId: overrides?.tenantId ?? TENANT_ID,
      provider: overrides?.provider ?? "manual",
      displayName: "S3e",
    });
    connection.attachCredentials(CredentialReference.create("cred_s3e"));
    await connections.create(connection);
    if (overrides?.mode && overrides.mode !== "mixed_or_unknown_feed") {
      await connections.persistSemanticState({
        tenantId: connection.tenantId,
        connectionId: connection.id,
        expectedSemanticConfigVersion: 1,
        semanticMode: overrides.mode,
        semanticConfigVersion: 2,
        updatedAt: new Date(),
      });
    }
  }

  beforeEach(async () => {
    connections = new InMemoryChannelConnectionRepository();
    auditLog = new InMemoryLifecycleAuditLog();
    unitOfWork = new InMemoryChannelConnectionLifecycleUnitOfWork(connections, auditLog);
    registry = new ChannelProviderRegistry();
    registerFlexibleProvider(registry);
    activate = new ActivateChannelConnectionUseCase(
      connections,
      registry,
      permissionChecker,
      unitOfWork,
    );
    resume = new ResumeChannelConnectionUseCase(
      connections,
      registry,
      permissionChecker,
      unitOfWork,
    );
  });

  it("activates from pending_auth", async () => {
    await seedPendingAuth();
    const result = await activate.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
        correlationId: "corr-activate-1",
      },
      adminActor,
      audit,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({
      connectionId: CONNECTION_ID,
      status: "active",
      semanticMode: "mixed_or_unknown_feed",
      semanticConfigVersion: 1,
    });
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("active");
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]?.action).toBe("channel.connection.activated");
    expect(auditLog.entries[0]?.metadata).toMatchObject({
      previousStatus: "pending_auth",
      newStatus: "active",
      semanticMode: "mixed_or_unknown_feed",
      semanticConfigVersion: 1,
      correlationId: "corr-activate-1",
    });
  });

  it("activates from error", async () => {
    await seedPendingAuth();
    const pending = await connections.findById(TENANT_ID, CONNECTION_ID);
    pending!.activate();
    await connections.activateWithExpectedSemanticVersion(pending!, 1, "pending_auth");
    const active = await connections.findById(TENANT_ID, CONNECTION_ID);
    const prior = active!.status;
    active!.markError("boom");
    await connections.markErrorWithExpectedSemanticVersion(active!, 1, prior);

    const result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().status).toBe("active");
    expect(auditLog.entries[0]?.metadata).toMatchObject({ previousStatus: "error" });
  });

  it("rejects activate from draft, paused, and active", async () => {
    const pureDraft = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: "manual",
      displayName: "Draft",
    });
    await connections.create(pureDraft);
    const loaded = await connections.findById(TENANT_ID, CONNECTION_ID);
    loaded!.attachCredentials(CredentialReference.create("cred"));
    await connections.saveNonSemanticChanges(loaded!);
    let result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);

    await connections.clear();
    await seedPendingAuth();
    await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(result.getError()).toBeInstanceOf(ConflictError);

    const active = await connections.findById(TENANT_ID, CONNECTION_ID);
    const prior = active!.status;
    active!.pause();
    await connections.pauseWithExpectedSemanticVersion(active!, 1, prior);
    result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(result.getError()).toBeInstanceOf(ConflictError);
    expect(auditLog.entries).toHaveLength(1);
  });

  it("resumes from paused and rejects resume from error/pending_auth/active", async () => {
    await seedPendingAuth();
    await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    const active = await connections.findById(TENANT_ID, CONNECTION_ID);
    const prior = active!.status;
    active!.pause();
    await connections.pauseWithExpectedSemanticVersion(active!, 1, prior);

    const resumed = await resume.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
        correlationId: "corr-resume-1",
      },
      adminActor,
      audit,
    );
    expect(resumed.isSuccess).toBe(true);
    expect(resumed.getValue()).toEqual({
      connectionId: CONNECTION_ID,
      status: "active",
      semanticMode: "mixed_or_unknown_feed",
      semanticConfigVersion: 1,
    });
    expect(auditLog.entries.filter((e) => e.action === "channel.connection.resumed")).toHaveLength(
      1,
    );
    expect(
      auditLog.entries.find((e) => e.action === "channel.connection.resumed")?.metadata,
    ).toMatchObject({
      previousStatus: "paused",
      correlationId: "corr-resume-1",
    });

    let result = await resume.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(result.getError()).toBeInstanceOf(ConflictError);

    await connections.clear();
    auditLog.clear();
    await seedPendingAuth();
    result = await resume.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(result.getError()).toBeInstanceOf(ConflictError);

    const pending = await connections.findById(TENANT_ID, CONNECTION_ID);
    pending!.activate();
    await connections.activateWithExpectedSemanticVersion(pending!, 1, "pending_auth");
    const again = await connections.findById(TENANT_ID, CONNECTION_ID);
    const priorActive = again!.status;
    again!.markError("x");
    await connections.markErrorWithExpectedSemanticVersion(again!, 1, priorActive);
    result = await resume.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(result.getError()).toBeInstanceOf(ConflictError);
  });

  it("denies manage permission with ForbiddenError", async () => {
    await seedPendingAuth();
    const result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      managerActor,
      audit,
    );
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
    expect(auditLog.entries).toHaveLength(0);
  });

  it("denies reservation_feed elevate permission with ForbiddenError", async () => {
    await seedPendingAuth({ mode: "reservation_feed" });
    const limitedChecker = {
      hasPermission: (_actor: unknown, permission: string) =>
        permission === PERMISSIONS.CHANNELS_CONNECTION_MANAGE,
    } as PermissionChecker;
    activate = new ActivateChannelConnectionUseCase(
      connections,
      registry,
      limitedChecker,
      unitOfWork,
    );
    const result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 2 },
      adminActor,
      audit,
    );
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
    expect(auditLog.entries).toHaveLength(0);
  });

  it("fails closed when provider registration is missing", async () => {
    await seedPendingAuth();
    registry = new ChannelProviderRegistry();
    activate = new ActivateChannelConnectionUseCase(
      connections,
      registry,
      permissionChecker,
      unitOfWork,
    );
    const result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(result.getError()).toBeInstanceOf(ChannelProviderRegistrationError);
  });

  it("rejects provider-disallowed semantic mode with ValidationError", async () => {
    registry = new ChannelProviderRegistry();
    registerRestrictedProvider(registry);
    activate = new ActivateChannelConnectionUseCase(
      connections,
      registry,
      permissionChecker,
      unitOfWork,
    );
    await seedPendingAuth({ provider: "ical", mode: "reservation_feed" });
    const result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 2 },
      adminActor,
      audit,
    );
    expect(result.getError()).toBeInstanceOf(ValidationError);
  });

  it("rejects missing credentials with ValidationError", async () => {
    const draft = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: "manual",
      displayName: "No creds",
    });
    await connections.create(draft);
    // Force pending_auth without credentials via restricted path is impossible;
    // reconstitute-like store write: create as pending via activate path simulation —
    // use pause/error primitives after fabricating status through create with pending.
    const pending = ChannelConnection.reconstitute({
      ...draft.toProps(),
      status: "pending_auth",
      credentialRef: null,
    });
    connections.restoreStoreSnapshot(
      new Map([[`${TENANT_ID}:${CONNECTION_ID}`, pending.toProps()]]),
    );

    const result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(result.getError()).toBeInstanceOf(ValidationError);
    expect(auditLog.entries).toHaveLength(0);
  });

  it("rejects stale semantic version with ConflictError", async () => {
    await seedPendingAuth();
    const result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 99 },
      adminActor,
      audit,
    );
    expect(result.getError()).toBeInstanceOf(ConflictError);
    expect((result.getError() as ConflictError).conflictType).toBe("semantic_epoch_conflict");
    expect(auditLog.entries).toHaveLength(0);
  });

  it("returns NotFoundError for cross-tenant connection", async () => {
    await seedPendingAuth({ tenantId: OTHER_TENANT_ID, id: CONNECTION_ID });
    const result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(result.getError()).toBeInstanceOf(NotFoundError);
  });

  it("rolls back lifecycle state when audit fails", async () => {
    await seedPendingAuth();
    const failingAudit = new InMemoryLifecycleAuditLog();
    failingAudit.append = async () => {
      throw new Error("audit boom");
    };
    unitOfWork = new InMemoryChannelConnectionLifecycleUnitOfWork(connections, failingAudit);
    activate = new ActivateChannelConnectionUseCase(
      connections,
      registry,
      permissionChecker,
      unitOfWork,
    );

    const result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(result.isFailure).toBe(true);
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("pending_auth");
  });

  it("duplicate activate yields one success and one conflict with a single audit", async () => {
    await seedPendingAuth();
    const outcomes = await Promise.all([
      activate.execute(
        { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
        adminActor,
        audit,
      ),
      activate.execute(
        { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
        adminActor,
        audit,
      ),
    ]);
    const successes = outcomes.filter((o) => o.isSuccess);
    const failures = outcomes.filter((o) => o.isFailure);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.getError()).toBeInstanceOf(ConflictError);
    expect(auditLog.entries.filter((e) => e.action === "channel.connection.activated")).toHaveLength(
      1,
    );
  });

  it("generic save cannot change status; restricted primitives never write active", async () => {
    await seedPendingAuth();
    await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    const loaded = await connections.findById(TENANT_ID, CONNECTION_ID);
    loaded!.pause();
    await connections.saveNonSemanticChanges(loaded!);
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("active");

    const prior = loaded!.status;
    // loaded is paused in memory but DB is active — pause helper with wrong prior fails;
    const fresh = await connections.findById(TENANT_ID, CONNECTION_ID);
    const priorActive = fresh!.status;
    fresh!.pause();
    await connections.pauseWithExpectedSemanticVersion(fresh!, 1, priorActive);
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("paused");

    const paused = await connections.findById(TENANT_ID, CONNECTION_ID);
    paused!.resume(); // memory active
    await expect(
      connections.pauseWithExpectedSemanticVersion(paused!, 1, "paused"),
    ).rejects.toBeInstanceOf(ValidationError);
    void prior;
  });

  it("activate and resume share semantic-policy parity for reservation_feed", async () => {
    await seedPendingAuth({ mode: "reservation_feed" });
    const ok = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 2 },
      adminActor,
      audit,
    );
    expect(ok.isSuccess).toBe(true);
    expect(ok.getValue().semanticMode).toBe("reservation_feed");
    expect(ok.getValue().semanticConfigVersion).toBe(2);

    const active = await connections.findById(TENANT_ID, CONNECTION_ID);
    const prior = active!.status;
    active!.pause();
    await connections.pauseWithExpectedSemanticVersion(active!, 2, prior);

    const resumed = await resume.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 2 },
      adminActor,
      audit,
    );
    expect(resumed.isSuccess).toBe(true);
    expect(resumed.getValue().semanticMode).toBe("reservation_feed");
  });
});

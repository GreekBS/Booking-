import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ActivateChannelConnectionUseCase,
  ResumeChannelConnectionUseCase,
  ChannelConnection,
  ChannelProviderRegistry,
  ConflictError,
  CredentialReference,
  FEED_SEMANTIC_MODES,
  NotFoundError,
  PermissionChecker,
  SetChannelConnectionSemanticModeUseCase,
  createProviderCapabilities,
  withDefaultProviderRegistrationPolicies,
} from "@hcp/domain";
import {
  PrismaChannelConnectionLifecycleUnitOfWork,
  PrismaChannelConnectionRepository,
  PrismaChannelPollCursorRepository,
  PrismaChannelSemanticModeTransitionStore,
  setTenantContext,
} from "../../src";
import { prisma } from "./helpers";

const runIntegration = process.env.DATABASE_URL
  ? (title: string, fn: () => void) =>
      describe(title, { hookTimeout: 120_000, timeout: 120_000 }, fn)
  : describe.skip;

const INTEGRATION_TX_OPTIONS = { maxWait: 20_000, timeout: 60_000 } as const;

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440930";
const OTHER_TENANT_ID = "550e8400-e29b-41d4-a716-446655440931";
const CONNECTION_ID = "s3e-pg-connection";
const ACTOR_ID = "550e8400-e29b-41d4-a716-446655440932";

function registerProvider(registry: ChannelProviderRegistry): void {
  registry.register(
    withDefaultProviderRegistrationPolicies({
      providerId: "manual",
      capabilities: createProviderCapabilities({
        inbound: { polling: false, webhooks: false, reservationImport: false },
      }),
      status: "active",
      auth: null,
      webhooks: null,
      polling: null,
      reservationImport: null,
      availabilityExport: null,
      rateRestrictionExport: null,
      reservationExport: null,
      allowedFeedSemanticModes: [...FEED_SEMANTIC_MODES],
    }),
  );
}

async function seedTenantGraph(): Promise<void> {
  await prisma.auditLog.deleteMany({
    where: { actorId: ACTOR_ID },
  });
  await prisma.channelSemanticTransitionCommand.deleteMany({
    where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  });
  await prisma.channelPollCursor.deleteMany({
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
      { id: TENANT_ID, name: "S3e Tenant", slug: "int-s3e-tenant" },
      { id: OTHER_TENANT_ID, name: "S3e Other", slug: "int-s3e-other" },
    ],
  });
  await prisma.user.create({
    data: { id: ACTOR_ID, email: "s3e@integration.test", name: "S3e Actor" },
  });
}

async function seedPendingAuth(
  repository: PrismaChannelConnectionRepository,
  id = CONNECTION_ID,
): Promise<void> {
  const connection = ChannelConnection.createDraft({
    id,
    tenantId: TENANT_ID,
    provider: "manual",
    displayName: "S3e PG",
  });
  connection.attachCredentials(CredentialReference.create("cred_s3e_pg"));
  await repository.create(connection);
}

runIntegration("CM-4b S3e Prisma lifecycle activate/resume", () => {
  const repository = new PrismaChannelConnectionRepository();
  const unitOfWork = new PrismaChannelConnectionLifecycleUnitOfWork(
    prisma,
    INTEGRATION_TX_OPTIONS,
  );
  const permissionChecker = new PermissionChecker();
  let registry: ChannelProviderRegistry;
  let activate: ActivateChannelConnectionUseCase;
  let resume: ResumeChannelConnectionUseCase;

  const adminActor = {
    userId: ACTOR_ID,
    role: "admin" as const,
    propertyIds: null,
  };
  const audit = { actorId: ACTOR_ID, ipAddress: null };

  beforeEach(async () => {
    await seedTenantGraph();

    registry = new ChannelProviderRegistry();
    registerProvider(registry);
    activate = new ActivateChannelConnectionUseCase(
      repository,
      registry,
      permissionChecker,
      unitOfWork,
    );
    resume = new ResumeChannelConnectionUseCase(
      repository,
      registry,
      permissionChecker,
      unitOfWork,
    );
  });

  afterAll(async () => {
    await seedTenantGraph();
    await prisma.$disconnect();
  });

  it("activates from pending_auth and resumes from paused", async () => {
    await seedPendingAuth(repository);
    const activated = await activate.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
        correlationId: "s3e-corr",
      },
      adminActor,
      audit,
    );
    expect(activated.isSuccess).toBe(true);
    expect(activated.getValue().status).toBe("active");

    const audits = await prisma.auditLog.findMany({
      where: { tenantId: TENANT_ID, action: "channel.connection.activated" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({
      previousStatus: "pending_auth",
      correlationId: "s3e-corr",
    });

    const active = await repository.findById(TENANT_ID, CONNECTION_ID);
    const prior = active!.status;
    active!.pause();
    await repository.pauseWithExpectedSemanticVersion(active!, 1, prior);

    const resumed = await resume.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(resumed.isSuccess).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT_ID, action: "channel.connection.resumed" },
      }),
    ).toBe(1);
  });

  it("activates from error", async () => {
    await seedPendingAuth(repository);
    const pending = await repository.findById(TENANT_ID, CONNECTION_ID);
    pending!.activate();
    await repository.activateWithExpectedSemanticVersion(pending!, 1, "pending_auth");
    const active = await repository.findById(TENANT_ID, CONNECTION_ID);
    const prior = active!.status;
    active!.markError("provider down");
    await repository.markErrorWithExpectedSemanticVersion(active!, 1, prior);

    const result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(result.isSuccess).toBe(true);
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.lastError).toBeNull();
  });

  it("enforces credential_ref IS NOT NULL and status + semantic CAS", async () => {
    await seedPendingAuth(repository);
    await setTenantContext(prisma, TENANT_ID);
    await prisma.channelConnection.update({
      where: { tenantId_id: { tenantId: TENANT_ID, id: CONNECTION_ID } },
      data: { credentialRef: null },
    });

    const result = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    // Domain activate throws ValidationError before CAS when credential missing on aggregate.
    expect(result.isFailure).toBe(true);
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("pending_auth");

    // Credential race: credentials present at load, cleared before CAS.
    await prisma.channelConnection.update({
      where: { tenantId_id: { tenantId: TENANT_ID, id: CONNECTION_ID } },
      data: { credentialRef: "cred_race" },
    });
    const loaded = await repository.findById(TENANT_ID, CONNECTION_ID);
    loaded!.activate();
    await setTenantContext(prisma, TENANT_ID);
    await prisma.channelConnection.update({
      where: { tenantId_id: { tenantId: TENANT_ID, id: CONNECTION_ID } },
      data: { credentialRef: null },
    });
    await expect(
      repository.activateWithExpectedSemanticVersion(loaded!, 1, "pending_auth"),
    ).rejects.toMatchObject({ conflictType: "credential_conflict" });
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("pending_auth");
  });

  it("classifies stale lifecycle vs semantic conflicts and zero-row NotFound", async () => {
    await seedPendingAuth(repository);
    const pending = await repository.findById(TENANT_ID, CONNECTION_ID);
    pending!.activate();
    await expect(
      repository.activateWithExpectedSemanticVersion(pending!, 1, "error"),
    ).rejects.toMatchObject({ conflictType: "lifecycle_status_conflict" });

    await expect(
      repository.activateWithExpectedSemanticVersion(pending!, 99, "pending_auth"),
    ).rejects.toMatchObject({ conflictType: "semantic_epoch_conflict" });

    await expect(
      repository.activateWithExpectedSemanticVersion(
        ChannelConnection.createDraft({
          id: "missing-s3e",
          tenantId: TENANT_ID,
          provider: "manual",
          displayName: "x",
        }),
        1,
        "pending_auth",
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("concurrent duplicate activate yields one winner and one audit", async () => {
    await seedPendingAuth(repository);
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
    expect(outcomes.filter((o) => o.isSuccess)).toHaveLength(1);
    expect(outcomes.filter((o) => o.isFailure)).toHaveLength(1);
    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT_ID, action: "channel.connection.activated" },
      }),
    ).toBe(1);
  });

  it("audit failure rolls back status; TX participation without nesting", async () => {
    await seedPendingAuth(repository);

    await expect(
      prisma.$transaction(
        async (tx) => {
          await setTenantContext(tx, TENANT_ID);
          const transactional = new PrismaChannelConnectionRepository(tx);
          const pending = await transactional.findById(TENANT_ID, CONNECTION_ID);
          pending!.activate();
          await transactional.activateWithExpectedSemanticVersion(pending!, 1, "pending_auth");
          throw new Error("force rollback");
        },
        INTEGRATION_TX_OPTIONS,
      ),
    ).rejects.toThrow("force rollback");

    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("pending_auth");

    await prisma.$transaction(async (tx) => {
      const transactional = new PrismaChannelConnectionRepository(tx);
      await setTenantContext(tx, TENANT_ID);
      const pending = await transactional.findById(TENANT_ID, CONNECTION_ID);
      pending!.activate();
      await transactional.activateWithExpectedSemanticVersion(pending!, 1, "pending_auth");
    }, INTEGRATION_TX_OPTIONS);
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("active");
  });

  it("generic save cannot change status or set active; restricted primitives cannot write active", async () => {
    await seedPendingAuth(repository);
    await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );

    const loaded = await repository.findById(TENANT_ID, CONNECTION_ID);
    const semanticMode = loaded!.semanticMode;
    const semanticVersion = loaded!.semanticConfigVersion;
    const provider = loaded!.provider;
    loaded!.pause();
    await repository.saveNonSemanticChanges(loaded!);
    const afterSave = await repository.findById(TENANT_ID, CONNECTION_ID);
    expect(afterSave?.status).toBe("active");
    expect(afterSave?.semanticMode).toBe(semanticMode);
    expect(afterSave?.semanticConfigVersion).toBe(semanticVersion);
    expect(afterSave?.provider).toBe(provider);

    const fresh = await repository.findById(TENANT_ID, CONNECTION_ID);
    await expect(
      repository.pauseWithExpectedSemanticVersion(
        ChannelConnection.reconstitute({ ...fresh!.toProps(), status: "active" }),
        1,
        "active",
      ),
    ).rejects.toThrow(/must never write status=active/);
  });

  it("S3d first then S3e stale epoch; S3e first then S3d still transitions", async () => {
    await seedPendingAuth(repository);
    await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );

    const cursors = new PrismaChannelPollCursorRepository();
    const transitionStore = new PrismaChannelSemanticModeTransitionStore(
      prisma,
      {},
      INTEGRATION_TX_OPTIONS,
    );
    const setMode = new SetChannelConnectionSemanticModeUseCase(
      transitionStore,
      repository,
      registry,
      permissionChecker,
    );

    // S3d commits first
    const s3d = await setMode.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        commandId: "s3e-race-s3d-first",
        targetMode: "availability_block_feed",
        confirmation: {
          confirmed: true,
          acknowledgedFromMode: "mixed_or_unknown_feed",
          acknowledgedToMode: "availability_block_feed",
        },
        expectedSemanticConfigVersion: 1,
      },
      adminActor,
      audit,
    );
    expect(s3d.isSuccess).toBe(true);

    const active = await repository.findById(TENANT_ID, CONNECTION_ID);
    const prior = active!.status;
    active!.pause();
    await repository.pauseWithExpectedSemanticVersion(active!, 2, prior);

    const staleResume = await resume.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(staleResume.getError()).toBeInstanceOf(ConflictError);
    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT_ID, action: "channel.connection.resumed" },
      }),
    ).toBe(0);

    // Reset: S3e first then S3d
    await resume.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 2 },
      adminActor,
      audit,
    );
    const s3dAfter = await setMode.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        commandId: "s3e-race-s3e-first",
        targetMode: "reservation_feed",
        confirmation: {
          confirmed: true,
          acknowledgedFromMode: "availability_block_feed",
          acknowledgedToMode: "reservation_feed",
        },
        expectedSemanticConfigVersion: 2,
      },
      adminActor,
      audit,
    );
    expect(s3dAfter.isSuccess).toBe(true);
    expect(
      (await repository.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion,
    ).toBe(3);
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).toBeNull();
  });

  it("preserves cursor and semantic fields across activate", async () => {
    await seedPendingAuth(repository);
    const cursors = new PrismaChannelPollCursorRepository();
    await cursors.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "cursor-keep",
    });

    await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );

    const found = await repository.findById(TENANT_ID, CONNECTION_ID);
    expect(found?.semanticMode).toBe("mixed_or_unknown_feed");
    expect(found?.semanticConfigVersion).toBe(1);
    expect(found?.provider).toBe("manual");
    const cursor = await cursors.getCursor(TENANT_ID, CONNECTION_ID);
    expect(cursor?.payload).toBe("cursor-keep");
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ActivateChannelConnectionUseCase,
  ChannelConnection,
  ChannelProviderRegistry,
  ConflictError,
  CredentialReference,
  EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
  FEED_SEMANTIC_MODES,
  GetChannelConnectionSemanticConfigurationUseCase,
  IdempotencyConflictError,
  PermissionChecker,
  ResumeChannelConnectionUseCase,
  SetChannelConnectionSemanticModeUseCase,
  createProviderCapabilities,
  withDefaultProviderRegistrationPolicies,
} from "@hcp/domain";
import {
  PrismaChannelConnectionLifecycleUnitOfWork,
  PrismaChannelConnectionRepository,
  PrismaChannelPollCursorRepository,
  PrismaChannelSemanticModeTransitionStore,
} from "../../src";
import { prisma } from "./helpers";

const runIntegration = process.env.DATABASE_URL
  ? (title: string, fn: () => void) =>
      describe(title, { hookTimeout: 120_000, timeout: 120_000 }, fn)
  : describe.skip;

const INTEGRATION_TX_OPTIONS = { maxWait: 20_000, timeout: 60_000 } as const;

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440940";
const OTHER_TENANT_ID = "550e8400-e29b-41d4-a716-446655440941";
const CONNECTION_ID = "s3f-pg-connection";
const ACTOR_ID = "550e8400-e29b-41d4-a716-446655440942";
const OTHER_ACTOR_ID = "550e8400-e29b-41d4-a716-446655440943";

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
  await prisma.channelSemanticTransitionCommand.deleteMany({
    where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  });
  await prisma.auditLog.deleteMany({
    where: { actorId: { in: [ACTOR_ID, OTHER_ACTOR_ID] } },
  });
  await prisma.channelPollCursor.deleteMany({
    where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  });
  await prisma.channelConnection.deleteMany({
    where: { tenantId: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [ACTOR_ID, OTHER_ACTOR_ID] } } });
  await prisma.tenant.deleteMany({
    where: { id: { in: [TENANT_ID, OTHER_TENANT_ID] } },
  });

  await prisma.tenant.createMany({
    data: [
      { id: TENANT_ID, name: "S3f Tenant", slug: "int-s3f-tenant" },
      { id: OTHER_TENANT_ID, name: "S3f Other", slug: "int-s3f-other" },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: ACTOR_ID, email: "s3f@integration.test", name: "S3f Actor" },
      { id: OTHER_ACTOR_ID, email: "s3f-other@integration.test", name: "Other" },
    ],
  });
}

async function seedActiveConnection(): Promise<void> {
  const connections = new PrismaChannelConnectionRepository();
  const connection = ChannelConnection.createDraft({
    id: CONNECTION_ID,
    tenantId: TENANT_ID,
    provider: "manual",
    displayName: "S3f PG",
  });
  connection.attachCredentials(CredentialReference.create("cred_s3f"));
  connection.activate();
  await connections.create(connection);
}

runIntegration("CM-4b S3f production DI semantic management (PostgreSQL)", () => {
  const repository = new PrismaChannelConnectionRepository();
  const cursors = new PrismaChannelPollCursorRepository();
  const registry = new ChannelProviderRegistry();
  registerProvider(registry);
  const permissionChecker = new PermissionChecker();
  const adminActor = {
    userId: ACTOR_ID,
    role: "admin" as const,
    propertyIds: null,
  };
  const audit = { actorId: ACTOR_ID, ipAddress: "127.0.0.1" };

  const transitionStore = new PrismaChannelSemanticModeTransitionStore(
    prisma,
    {},
    INTEGRATION_TX_OPTIONS,
  );
  // Production-equivalent graph: Prisma store → SetMode / GetConfig use cases.
  const setMode = new SetChannelConnectionSemanticModeUseCase(
    transitionStore,
    repository,
    registry,
    permissionChecker,
  );
  const getConfig = new GetChannelConnectionSemanticConfigurationUseCase(
    repository,
    registry,
    permissionChecker,
  );

  const lifecycleUow = new PrismaChannelConnectionLifecycleUnitOfWork(
    prisma,
    INTEGRATION_TX_OPTIONS,
  );
  const activate = new ActivateChannelConnectionUseCase(
    repository,
    registry,
    permissionChecker,
    lifecycleUow,
  );
  const resume = new ResumeChannelConnectionUseCase(
    repository,
    registry,
    permissionChecker,
    lifecycleUow,
  );

  beforeEach(async () => {
    await seedTenantGraph();
    await seedActiveConnection();
  });

  afterAll(async () => {
    await seedTenantGraph();
    await prisma.$disconnect();
  });

  it("reads semantic configuration through the read use case", async () => {
    const result = await getConfig.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID },
      adminActor,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toMatchObject({
      connectionId: CONNECTION_ID,
      provider: "manual",
      lifecycleStatus: "active",
      semanticMode: "mixed_or_unknown_feed",
      semanticConfigVersion: 1,
      canDeclareReservationFeed: true,
    });
    expect(result.getValue().allowedSemanticModes).toEqual([...FEED_SEMANTIC_MODES]);
  });

  it("commits receipt + semantic update + cursor reset + audit atomically via use case", async () => {
    await cursors.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "s3f-cursor",
    });

    const result = await setMode.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        commandId: "s3f-atomic-1",
        expectedSemanticConfigVersion: 1,
        targetMode: "availability_block_feed",
        confirmation: {
          confirmed: true,
          acknowledgedFromMode: "mixed_or_unknown_feed",
          acknowledgedToMode: "availability_block_feed",
        },
        reason: "s3f pg",
      },
      adminActor,
      audit,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toMatchObject({
      changed: true,
      cursorReset: true,
      replayed: false,
      newSemanticConfigVersion: 2,
    });
    // Baseline reset updates the row in place and retains the durable version.
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).toMatchObject({
      payload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
      version: 1,
      semanticConfigVersion: 2,
    });
    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT_ID, action: "channel.connection.semantic_mode_changed" },
      }),
    ).toBe(1);
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("active");
  });

  it("exact replay performs no second mutation", async () => {
    const command = {
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      commandId: "s3f-replay-1",
      expectedSemanticConfigVersion: 1,
      targetMode: "availability_block_feed" as const,
      confirmation: {
        confirmed: true as const,
        acknowledgedFromMode: "mixed_or_unknown_feed" as const,
        acknowledgedToMode: "availability_block_feed" as const,
      },
    };
    expect((await setMode.execute(command, adminActor, audit)).getValue().replayed).toBe(false);
    const replay = await setMode.execute(command, adminActor, audit);
    expect(replay.getValue().replayed).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT_ID, action: "channel.connection.semantic_mode_changed" },
      }),
    ).toBe(1);
  });

  it("maps fingerprint mismatch and same-mode stale version to conflicts", async () => {
    await setMode.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        commandId: "s3f-fp-1",
        expectedSemanticConfigVersion: 1,
        targetMode: "availability_block_feed",
        confirmation: {
          confirmed: true,
          acknowledgedFromMode: "mixed_or_unknown_feed",
          acknowledgedToMode: "availability_block_feed",
        },
        reason: "one",
      },
      adminActor,
      audit,
    );
    const conflict = await setMode.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        commandId: "s3f-fp-1",
        expectedSemanticConfigVersion: 1,
        targetMode: "availability_block_feed",
        confirmation: {
          confirmed: true,
          acknowledgedFromMode: "mixed_or_unknown_feed",
          acknowledgedToMode: "availability_block_feed",
        },
        reason: "two",
      },
      adminActor,
      audit,
    );
    expect(conflict.getError()).toBeInstanceOf(IdempotencyConflictError);

    await seedTenantGraph();
    await seedActiveConnection();
    const staleSameMode = await setMode.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        commandId: "s3f-same-stale",
        expectedSemanticConfigVersion: 9,
        targetMode: "mixed_or_unknown_feed",
        confirmation: {
          confirmed: true,
          acknowledgedFromMode: "mixed_or_unknown_feed",
          acknowledgedToMode: "mixed_or_unknown_feed",
        },
      },
      adminActor,
      audit,
    );
    expect(staleSameMode.getError()).toBeInstanceOf(ConflictError);
  });

  it("same-mode current version commits no-op receipt", async () => {
    const result = await setMode.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        commandId: "s3f-noop",
        expectedSemanticConfigVersion: 1,
        targetMode: "mixed_or_unknown_feed",
        confirmation: {
          confirmed: true,
          acknowledgedFromMode: "mixed_or_unknown_feed",
          acknowledgedToMode: "mixed_or_unknown_feed",
        },
      },
      adminActor,
      audit,
    );
    expect(result.getValue()).toMatchObject({
      changed: false,
      cursorReset: false,
      newSemanticConfigVersion: 1,
      replayed: false,
    });
    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT_ID, action: "channel.connection.semantic_mode_changed" },
      }),
    ).toBe(0);
  });

  it("two operators at same expected version yield one winner", async () => {
    const cmdA = {
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      commandId: "s3f-race-a",
      expectedSemanticConfigVersion: 1,
      targetMode: "availability_block_feed" as const,
      confirmation: {
        confirmed: true as const,
        acknowledgedFromMode: "mixed_or_unknown_feed" as const,
        acknowledgedToMode: "availability_block_feed" as const,
      },
    };
    const cmdB = {
      ...cmdA,
      commandId: "s3f-race-b",
      targetMode: "reservation_feed" as const,
      confirmation: {
        confirmed: true as const,
        acknowledgedFromMode: "mixed_or_unknown_feed" as const,
        acknowledgedToMode: "reservation_feed" as const,
      },
    };

    const [a, b] = await Promise.all([
      setMode.execute(cmdA, adminActor, audit),
      setMode.execute(cmdB, adminActor, { actorId: OTHER_ACTOR_ID, ipAddress: null }),
    ]);
    const successes = [a, b].filter((r) => r.isSuccess);
    const failures = [a, b].filter((r) => r.isFailure);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.getError()).toBeInstanceOf(ConflictError);
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion).toBe(2);
  });

  it("rolls back when cursor reset / audit / receipt completion fails", async () => {
    for (const [label, hooks] of [
      ["cursor", { afterCursorReset: async () => { throw new Error("cursor fail"); } }],
      ["audit", { afterAudit: async () => { throw new Error("audit fail"); } }],
      ["receipt", { beforeReceiptCommit: async () => { throw new Error("receipt fail"); } }],
    ] as const) {
      await seedTenantGraph();
      await seedActiveConnection();
      const failingStore = new PrismaChannelSemanticModeTransitionStore(
        prisma,
        hooks,
        INTEGRATION_TX_OPTIONS,
      );
      const failingUseCase = new SetChannelConnectionSemanticModeUseCase(
        failingStore,
        repository,
        registry,
        permissionChecker,
      );
      const result = await failingUseCase.execute(
        {
          tenantId: TENANT_ID,
          connectionId: CONNECTION_ID,
          commandId: `s3f-rollback-${label}`,
          expectedSemanticConfigVersion: 1,
          targetMode: "availability_block_feed",
          confirmation: {
            confirmed: true,
            acknowledgedFromMode: "mixed_or_unknown_feed",
            acknowledgedToMode: "availability_block_feed",
          },
        },
        adminActor,
        audit,
      );
      expect(result.isFailure, label).toBe(true);
      expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion).toBe(1);
      expect(
        await prisma.channelSemanticTransitionCommand.count({ where: { tenantId: TENANT_ID } }),
      ).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: { tenantId: TENANT_ID, action: "channel.connection.semantic_mode_changed" },
        }),
      ).toBe(0);
    }
  });

  it("preserves inactive status and races with S3e activate/resume", async () => {
    const active = await repository.findById(TENANT_ID, CONNECTION_ID);
    active!.pause();
    await repository.pauseWithExpectedSemanticVersion(active!, 1, "active");

    const pausedSet = await setMode.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        commandId: "s3f-paused-set",
        expectedSemanticConfigVersion: 1,
        targetMode: "availability_block_feed",
        confirmation: {
          confirmed: true,
          acknowledgedFromMode: "mixed_or_unknown_feed",
          acknowledgedToMode: "availability_block_feed",
        },
      },
      adminActor,
      audit,
    );
    expect(pausedSet.isSuccess).toBe(true);
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("paused");

    // S3f first (already at v2), S3e resume with stale epoch fails.
    const staleResume = await resume.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(staleResume.getError()).toBeInstanceOf(ConflictError);

    // Reset: S3e first then S3f
    await seedTenantGraph();
    const pending = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: "manual",
      displayName: "S3f pending",
    });
    pending.attachCredentials(CredentialReference.create("cred_s3f_pending"));
    await repository.create(pending);

    const activated = await activate.execute(
      { tenantId: TENANT_ID, connectionId: CONNECTION_ID, expectedSemanticConfigVersion: 1 },
      adminActor,
      audit,
    );
    expect(activated.isSuccess).toBe(true);

    const afterActivate = await setMode.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        commandId: "s3f-after-s3e",
        expectedSemanticConfigVersion: 1,
        targetMode: "availability_block_feed",
        confirmation: {
          confirmed: true,
          acknowledgedFromMode: "mixed_or_unknown_feed",
          acknowledgedToMode: "availability_block_feed",
        },
      },
      adminActor,
      audit,
    );
    expect(afterActivate.isSuccess).toBe(true);
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("active");
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion).toBe(2);
  });

  it("creates no Booking or Inbox side effects", async () => {
    await setMode.execute(
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        commandId: "s3f-no-side-effects",
        expectedSemanticConfigVersion: 1,
        targetMode: "reservation_feed",
        confirmation: {
          confirmed: true,
          acknowledgedFromMode: "mixed_or_unknown_feed",
          acknowledgedToMode: "reservation_feed",
        },
      },
      adminActor,
      audit,
    );
    expect(await prisma.booking.count({ where: { tenantId: TENANT_ID } })).toBe(0);
    expect(await prisma.channelInboxItem.count({ where: { tenantId: TENANT_ID } })).toBe(0);
  });
});

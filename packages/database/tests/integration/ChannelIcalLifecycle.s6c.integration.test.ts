import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
  ChannelConnection,
  ChannelListingMapping,
  ConflictError,
  CredentialReference,
  EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
  EnqueueJobUseCase,
  ForceRedrivePendingIcalInventoryReconcileUseCase,
  InMemoryChannelCredentialVault,
  PermissionChecker,
  RotateIcalConnectionCredentialsUseCase,
  SweepPendingIcalInventoryReconcileUseCase,
  UpsertChannelListingMappingUseCase,
  fingerprintIcalCredentialRotationCommand,
  nextChannelPollCursorVersion,
  type IChannelCredentialStore,
  type IIcalInventoryReconcileJobQuery,
} from "@hcp/domain";
import {
  PrismaBackgroundJobRepository,
  PrismaChannelConnectionRepository,
  PrismaChannelConnectionStatusFinder,
  PrismaChannelListingMappingRepository,
  PrismaChannelPollCursorRepository,
  PrismaIcalChannelMappingLifecycleStore,
  PrismaIcalCredentialRotationStore,
  PrismaIcalInventoryReconcileJobQuery,
  PrismaJobScheduler,
  PrismaPendingIcalInventoryReconciliationReader,
} from "../../src";
import { prisma, setTenantContext } from "./helpers";

const runIntegration = process.env.DATABASE_URL
  ? (title: string, fn: () => void) =>
      describe(title, { hookTimeout: 240_000, timeout: 240_000 }, fn)
  : describe.skip;

/** Remote PostgreSQL latency exceeds Prisma's default 5000 ms interactive TX timeout. */
const INTEGRATION_TX_OPTIONS = { maxWait: 20_000, timeout: 60_000 } as const;

const TENANT = "550e8400-e29b-41d4-a716-446655440b00";
const OTHER_TENANT = "550e8400-e29b-41d4-a716-446655440b01";
const ACTOR = "550e8400-e29b-41d4-a716-446655440b02";
const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440b03";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440b04";
const OTHER_UNIT_ID = "550e8400-e29b-41d4-a716-446655440b05";
const CONNECTION_ID = "s6c-rotation-connection";
const MAPPING_ID = "s6c-rotation-mapping";

const FEED_URL = "https://feed.example.test/calendar/s6c-original.ics";
const ROTATED_FEED_URL = "https://feed.example.test/calendar/s6c-rotated.ics";

const adminActor = { userId: ACTOR, role: "admin" as const, propertyIds: null };
const auditContext = { actorId: ACTOR, ipAddress: "127.0.0.1" };

function rotationFingerprint(overrides: {
  commandId?: string;
  expectedSemanticConfigVersion?: number | null;
  material?: Record<string, string>;
  reason?: string | null;
} = {}): string {
  return fingerprintIcalCredentialRotationCommand({
    tenantId: TENANT,
    operation: CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
    commandId: overrides.commandId ?? "s6c-rot-1",
    connectionId: CONNECTION_ID,
    actorId: ACTOR,
    expectedSemanticConfigVersion:
      overrides.expectedSemanticConfigVersion === undefined
        ? 2
        : overrides.expectedSemanticConfigVersion,
    material: overrides.material ?? { feedUrl: ROTATED_FEED_URL },
    reason: overrides.reason === undefined ? "s6c integration" : overrides.reason,
  });
}

async function resetTenantGraph(): Promise<void> {
  const tenants = [TENANT, OTHER_TENANT];
  await prisma.$executeRaw`
    DELETE FROM "channel_ical_credential_rotation_commands"
    WHERE "tenant_id" IN (${TENANT}::uuid, ${OTHER_TENANT}::uuid)
  `;
  await prisma.auditLog.deleteMany({ where: { actorId: ACTOR } });
  await prisma.backgroundJob.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.outboxEvent.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.channelInventoryReconciliation.deleteMany({
    where: { tenantId: { in: tenants } },
  });
  await prisma.unitCalendarBlock.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.channelPollCursor.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.channelListingMapping.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.channelConnection.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.unit.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.property.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.user.deleteMany({ where: { id: ACTOR } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });

  await prisma.tenant.createMany({
    data: [
      { id: TENANT, name: "S6c Tenant", slug: "int-s6c-tenant" },
      { id: OTHER_TENANT, name: "S6c Other", slug: "int-s6c-other" },
    ],
  });
  await prisma.user.create({
    data: { id: ACTOR, email: "s6c@integration.test", name: "S6c Actor" },
  });
  await prisma.property.create({
    data: {
      id: PROPERTY_ID,
      tenantId: TENANT,
      name: "S6c Property",
      slug: "s6c-prop",
      status: "active",
      timezone: "UTC",
    },
  });
  await prisma.unit.createMany({
    data: [
      {
        id: UNIT_ID,
        tenantId: TENANT,
        propertyId: PROPERTY_ID,
        name: "S6c Unit",
        slug: "s6c-unit",
        status: "active",
        maxGuests: 4,
      },
      {
        id: OTHER_UNIT_ID,
        tenantId: TENANT,
        propertyId: PROPERTY_ID,
        name: "S6c Unit B",
        slug: "s6c-unit-b",
        status: "active",
        maxGuests: 4,
      },
    ],
  });
}

/**
 * Active `availability_block_feed` iCal connection at epoch 2, one active
 * mapping, and a durable poll cursor at version 1.
 */
async function seedActiveConnection(
  connections: PrismaChannelConnectionRepository,
  mappings: PrismaChannelListingMappingRepository,
  cursors: PrismaChannelPollCursorRepository,
): Promise<void> {
  const connection = ChannelConnection.createDraft({
    id: CONNECTION_ID,
    tenantId: TENANT,
    provider: "ical",
    displayName: "S6c PG",
  });
  connection.attachCredentials(CredentialReference.create("cred_s6c_original"));
  connection.activate();
  await connections.create(connection);
  connection.applySemanticModeChange("availability_block_feed");
  await connections.persistSemanticState({
    tenantId: TENANT,
    connectionId: CONNECTION_ID,
    expectedSemanticConfigVersion: 1,
    semanticMode: connection.semanticMode,
    semanticConfigVersion: connection.semanticConfigVersion,
    updatedAt: new Date(),
  });
  await mappings.save(
    ChannelListingMapping.createActive({
      id: MAPPING_ID,
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      externalListingId: "ext-s6c",
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
      syncDirection: "inbound",
    }),
  );
  await cursors.advanceCursor({
    tenantId: TENANT,
    connectionId: CONNECTION_ID,
    observedSemanticConfigVersion: 2,
    expectedCursorVersion: 0,
    nextPayload: "s6c-live-cursor",
  });
}

async function seedPendingGeneration(cursorVersion: number): Promise<void> {
  await setTenantContext(prisma, TENANT);
  await prisma.channelInventoryReconciliation.create({
    data: {
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      cursorVersion,
      semanticConfigVersion: 2,
      mappingId: MAPPING_ID,
      mappingVersion: 1,
      unitId: UNIT_ID,
      propertyId: PROPERTY_ID,
      snapshotHash: "d".repeat(64),
      actionableSnapshot: [],
      reconcileStatus: "pending",
      createdAt: new Date(),
    },
  });
}

async function seedChannelImportBlock(sourceIdentityKey: string): Promise<void> {
  await setTenantContext(prisma, TENANT);
  await prisma.$executeRaw`
    INSERT INTO "unit_calendar_blocks" (
      "id","tenant_id","unit_id","property_id","block_type","source_id",
      "check_in","check_out","status",
      "connection_id","semantic_config_version","mapping_id",
      "source_identity_key","entry_content_hash","identity_kind",
      "created_at","updated_at"
    ) VALUES (
      gen_random_uuid(), ${TENANT}::uuid, ${UNIT_ID}::uuid, ${PROPERTY_ID}::uuid,
      'channel_import'::"CalendarBlockType", NULL,
      '2026-09-10'::date, '2026-09-13'::date, 'active'::"CalendarBlockStatus",
      ${CONNECTION_ID}, 2, ${MAPPING_ID},
      ${sourceIdentityKey}, ${"e".repeat(64)}, 'uid_only',
      NOW(), NOW()
    )
  `;
}

async function countRotationRows(tenantId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "channel_ical_credential_rotation_commands"
    WHERE "tenant_id" = ${tenantId}::uuid
  `;
  return Number(rows[0]?.count ?? 0);
}

runIntegration("P1-S6c iCal credential rotation + mapping lifecycle (PostgreSQL)", () => {
  const connections = new PrismaChannelConnectionRepository();
  const mappings = new PrismaChannelListingMappingRepository();
  const cursors = new PrismaChannelPollCursorRepository();
  const permissionChecker = new PermissionChecker();

  function createRotationStore(
    hooks: ConstructorParameters<typeof PrismaIcalCredentialRotationStore>[1] = {},
    client: ConstructorParameters<typeof PrismaIcalCredentialRotationStore>[0] = prisma,
  ): PrismaIcalCredentialRotationStore {
    return new PrismaIcalCredentialRotationStore(client, hooks, INTEGRATION_TX_OPTIONS);
  }

  function createRotateUseCase(
    rotationStore: PrismaIcalCredentialRotationStore,
    vault: IChannelCredentialStore,
    log: (fields: Record<string, unknown>) => void = () => {},
  ): RotateIcalConnectionCredentialsUseCase {
    return new RotateIcalConnectionCredentialsUseCase(
      connections,
      rotationStore,
      vault,
      permissionChecker,
      log,
    );
  }

  function rotateCommand(overrides: Record<string, unknown> = {}) {
    return {
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      commandId: "s6c-rot-1",
      material: { feedUrl: ROTATED_FEED_URL },
      expectedSemanticConfigVersion: 2,
      reason: "s6c integration",
      ...overrides,
    };
  }

  beforeEach(async () => {
    await resetTenantGraph();
    await seedActiveConnection(connections, mappings, cursors);
  });

  afterAll(async () => {
    await resetTenantGraph();
    await prisma.$disconnect();
  });

  it("commits one epoch, baseline-resets the cursor, supersedes pending work, and stays paused", async () => {
    await seedPendingGeneration(1);
    await seedPendingGeneration(2);
    await seedChannelImportBlock("src-existing");

    const vault = new InMemoryChannelCredentialVault();
    const rotate = createRotateUseCase(createRotationStore(), vault);
    const result = await rotate.execute(rotateCommand(), adminActor, auditContext);

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.replayed).toBe(false);
    expect(value.pausedByRotation).toBe(true);
    expect(value.previousSemanticConfigVersion).toBe(2);
    expect(value.resultingSemanticConfigVersion).toBe(3);
    expect(value.cursorBaselineReset).toBe(true);
    expect(value.retainedCursorVersion).toBe(1);
    expect(value.supersededPendingCount).toBe(2);
    // Phase 5: rotation never auto-resumes.
    expect(value.lifecycleStatus).toBe("paused");
    expect(value.requiresOperatorResume).toBe(true);

    const connection = await connections.findById(TENANT, CONNECTION_ID);
    expect(connection?.status).toBe("paused");
    expect(connection?.semanticConfigVersion).toBe(3);
    expect(connection?.credentialRef?.value).not.toBe("cred_s6c_original");

    const cursor = await cursors.getCursor(TENANT, CONNECTION_ID);
    expect(cursor?.payload).toBe(EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD);
    expect(cursor?.version).toBe(1);
    expect(cursor?.semanticConfigVersion).toBe(3);

    await setTenantContext(prisma, TENANT);
    const generations = await prisma.channelInventoryReconciliation.findMany({
      where: { tenantId: TENANT, connectionId: CONNECTION_ID },
    });
    expect(generations).toHaveLength(2);
    expect(generations.every((g) => g.reconcileStatus === "superseded")).toBe(true);

    // V1 never removes already-materialized channel_import blocks.
    const blocks = await prisma.unitCalendarBlock.findMany({
      where: { tenantId: TENANT, blockType: "channel_import" },
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.sourceIdentityKey).toBe("src-existing");
    expect(blocks[0]?.status).toBe("active");

    const audits = await prisma.auditLog.findMany({
      where: {
        tenantId: TENANT,
        action: "channel.connection.ical_credentials_rotated",
        resourceId: CONNECTION_ID,
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({
      commandId: "s6c-rot-1",
      previousSemanticConfigVersion: 2,
      resultingSemanticConfigVersion: 3,
      supersededPendingCount: 2,
      credentialRefRotated: true,
    });
    // No credential material may reach the audit trail.
    expect(JSON.stringify(audits[0]?.metadata)).not.toContain("s6c-rotated");
  });

  it("persists a credential-free receipt with the operation identity and fingerprint", async () => {
    const vault = new InMemoryChannelCredentialVault();
    await createRotateUseCase(createRotationStore(), vault).execute(
      rotateCommand(),
      adminActor,
      auditContext,
    );

    const rows = await prisma.$queryRaw<
      Array<{
        operation: string;
        status: string;
        request_fingerprint: string;
        new_credential_ref: string | null;
        previous_credential_ref: string | null;
        cursor_baseline_reset: boolean | null;
        committed_at: Date | null;
        vault_written_at: Date | null;
      }>
    >`
      SELECT
        "operation",
        "status"::text AS status,
        "request_fingerprint",
        "new_credential_ref",
        "previous_credential_ref",
        "cursor_baseline_reset",
        "committed_at",
        "vault_written_at"
      FROM "channel_ical_credential_rotation_commands"
      WHERE "tenant_id" = ${TENANT}::uuid
        AND "command_id" = 's6c-rot-1'
    `;
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.operation).toBe(CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION);
    expect(row.status).toBe("committed");
    expect(row.request_fingerprint).toBe(rotationFingerprint());
    expect(row.previous_credential_ref).toBe("cred_s6c_original");
    expect(row.new_credential_ref).not.toBeNull();
    expect(row.cursor_baseline_reset).toBe(true);
    expect(row.committed_at).not.toBeNull();
    expect(row.vault_written_at).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain("s6c-rotated");
    expect(JSON.stringify(row)).not.toContain("feedUrl");
  });

  it("keeps the cursor sequence monotonic after a baseline reset", async () => {
    // A durable generation already consumed version 7.
    await seedPendingGeneration(7);

    const vault = new InMemoryChannelCredentialVault();
    const result = await createRotateUseCase(createRotationStore(), vault).execute(
      rotateCommand(),
      adminActor,
      auditContext,
    );
    expect(result.getValue().retainedCursorVersion).toBe(1);

    const resumed = await connections.findById(TENANT, CONNECTION_ID);
    resumed!.resume();
    await connections.resumeWithExpectedSemanticVersion(resumed!, 3, "paused");

    const advanced = await cursors.advanceCursor({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 3,
      expectedCursorVersion: 1,
      nextPayload: "s6c-post-rotation",
    });
    // max(cursor.version, MAX(recon.cursor_version)) + 1 — never restarted.
    expect(advanced.version).toBe(nextChannelPollCursorVersion(1, 7));
    expect(advanced.version).toBe(8);
  });

  it("rejects a second concurrent rotation claim for the same connection", async () => {
    const firstClient = new PrismaClient();
    const secondClient = new PrismaClient();
    try {
      const claimA = createRotationStore({}, firstClient).phase1PauseAndClaimCommand({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        commandId: "s6c-rot-a",
        actorId: ACTOR,
        requestFingerprint: rotationFingerprint({ commandId: "s6c-rot-a" }),
        expectedSemanticConfigVersion: 2,
        reason: "s6c integration",
      });
      const claimB = createRotationStore({}, secondClient).phase1PauseAndClaimCommand({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        commandId: "s6c-rot-b",
        actorId: ACTOR,
        requestFingerprint: rotationFingerprint({ commandId: "s6c-rot-b" }),
        expectedSemanticConfigVersion: 2,
        reason: "s6c integration",
      });

      const settled = await Promise.allSettled([claimA, claimB]);
      const fulfilled = settled.filter((s) => s.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);

      // Exactly one in-flight receipt survives; the connection paused once.
      expect(await countRotationRows(TENANT)).toBe(1);
      const inFlight = await createRotationStore().findInProgressForConnection(
        TENANT,
        CONNECTION_ID,
      );
      expect(inFlight).not.toBeNull();
      expect((await connections.findById(TENANT, CONNECTION_ID))?.status).toBe("paused");
      expect(
        (await connections.findById(TENANT, CONNECTION_ID))?.semanticConfigVersion,
      ).toBe(2);
    } finally {
      await firstClient.$disconnect();
      await secondClient.$disconnect();
    }
  });

  it(
    "reuses the sealed reference and commits one epoch after a crash between vault write and commit",
    async () => {
    await seedPendingGeneration(1);
    const vault = new InMemoryChannelCredentialVault();
    const store = createRotationStore();

    // Crash simulation: claim + vault write landed, commit did not.
    await store.phase1PauseAndClaimCommand({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      commandId: "s6c-rot-1",
      actorId: ACTOR,
      requestFingerprint: rotationFingerprint(),
      expectedSemanticConfigVersion: 2,
      reason: "s6c integration",
    });
    const sealed = await vault.putCredential(TENANT, { feedUrl: ROTATED_FEED_URL });
    await store.markVaultWritten({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      commandId: "s6c-rot-1",
      newCredentialRef: sealed.value,
    });

    let putCalls = 0;
    const countingVault: IChannelCredentialStore = {
      putCredential: (tenantId, material) => {
        putCalls += 1;
        return vault.putCredential(tenantId, material);
      },
      putWebhookVerification: (tenantId, secret) =>
        vault.putWebhookVerification(tenantId, secret),
      deleteSecret: (tenantId, secretId, kind) =>
        vault.deleteSecret(tenantId, secretId, kind),
    };

    const retried = await createRotateUseCase(store, countingVault).execute(
      rotateCommand(),
      adminActor,
      auditContext,
    );
    expect(retried.isSuccess).toBe(true);
    expect(putCalls).toBe(0);
    expect(retried.getValue().resultingSemanticConfigVersion).toBe(3);

    const connection = await connections.findById(TENANT, CONNECTION_ID);
    expect(connection?.credentialRef?.value).toBe(sealed.value);
    expect(connection?.semanticConfigVersion).toBe(3);
    expect(await countRotationRows(TENANT)).toBe(1);

    // A further retry replays the committed receipt: still one epoch, one audit.
    const replay = await createRotateUseCase(store, countingVault).execute(
      rotateCommand(),
      adminActor,
      auditContext,
    );
    expect(replay.isSuccess).toBe(true);
    expect(replay.getValue().replayed).toBe(true);
    expect(
      (await connections.findById(TENANT, CONNECTION_ID))?.semanticConfigVersion,
    ).toBe(3);
    expect(
      await prisma.auditLog.count({
        where: {
          tenantId: TENANT,
          action: "channel.connection.ical_credentials_rotated",
        },
      }),
    ).toBe(1);
  },
  180_000,
  );

  it("rolls back the whole epoch commit when a late stage fails", async () => {
    await seedPendingGeneration(1);
    const vault = new InMemoryChannelCredentialVault();
    const failing = createRotationStore({
      beforeReceiptCommit: async () => {
        throw new Error("injected commit-stage failure");
      },
    });

    const result = await createRotateUseCase(failing, vault).execute(
      rotateCommand(),
      adminActor,
      auditContext,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/injected commit-stage failure/);

    const connection = await connections.findById(TENANT, CONNECTION_ID);
    expect(connection?.status).toBe("paused");
    expect(connection?.semanticConfigVersion).toBe(2);
    expect(connection?.credentialRef?.value).toBe("cred_s6c_original");

    const cursor = await cursors.getCursor(TENANT, CONNECTION_ID);
    expect(cursor?.payload).toBe("s6c-live-cursor");
    expect(cursor?.semanticConfigVersion).toBe(2);

    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.channelInventoryReconciliation.count({
        where: { tenantId: TENANT, reconcileStatus: "pending" },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT, action: "channel.connection.ical_credentials_rotated" },
      }),
    ).toBe(0);
    // The receipt survives as in_progress so the operator can retry.
    const receipt = await failing.findCommand(TENANT, "s6c-rot-1");
    expect(receipt?.status).toBe("in_progress");
    expect(receipt?.newCredentialRef).not.toBeNull();
  });

  it("refuses to commit when the connection is not paused", async () => {
    const vault = new InMemoryChannelCredentialVault();
    const store = createRotationStore();
    await store.phase1PauseAndClaimCommand({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      commandId: "s6c-rot-1",
      actorId: ACTOR,
      requestFingerprint: rotationFingerprint(),
      expectedSemanticConfigVersion: 2,
      reason: "s6c integration",
    });
    const sealed = await vault.putCredential(TENANT, { feedUrl: ROTATED_FEED_URL });
    await store.markVaultWritten({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      commandId: "s6c-rot-1",
      newCredentialRef: sealed.value,
    });

    const resumed = await connections.findById(TENANT, CONNECTION_ID);
    resumed!.resume();
    await connections.resumeWithExpectedSemanticVersion(resumed!, 2, "paused");

    await expect(
      store.phase3CommitEpoch({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        commandId: "s6c-rot-1",
        actorId: ACTOR,
        newCredentialRef: sealed.value,
        reason: "s6c integration",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(
      (await connections.findById(TENANT, CONNECTION_ID))?.semanticConfigVersion,
    ).toBe(2);
  });

  it("isolates rotation receipts across tenants under RLS", async () => {
    const vault = new InMemoryChannelCredentialVault();
    await createRotateUseCase(createRotationStore(), vault).execute(
      rotateCommand(),
      adminActor,
      auditContext,
    );
    expect(await countRotationRows(TENANT)).toBe(1);

    const store = createRotationStore();
    expect(await store.findCommand(OTHER_TENANT, "s6c-rot-1")).toBeNull();
    expect(
      await store.findInProgressForConnection(OTHER_TENANT, CONNECTION_ID),
    ).toBeNull();

    // The migration role bypasses RLS, so isolation is proven under a
    // non-owner role with the tenant context set to the other tenant.
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("GRANT USAGE ON SCHEMA public TO authenticated");
        await tx.$executeRawUnsafe(
          "GRANT SELECT, INSERT ON channel_ical_credential_rotation_commands TO authenticated",
        );
        await setTenantContext(tx, OTHER_TENANT);
        await tx.$executeRawUnsafe("SET LOCAL ROLE authenticated");

        const visible = await tx.$queryRaw<Array<{ tenant_id: string }>>`
          SELECT "tenant_id"
          FROM "channel_ical_credential_rotation_commands"
        `;
        expect(visible).toHaveLength(0);

        await tx.$executeRaw`
          INSERT INTO "channel_ical_credential_rotation_commands" (
            "tenant_id",
            "operation",
            "command_id",
            "connection_id",
            "actor_id",
            "request_fingerprint",
            "status"
          ) VALUES (
            ${TENANT}::uuid,
            ${CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION},
            'cross-tenant-write',
            ${CONNECTION_ID},
            ${ACTOR}::uuid,
            ${"c".repeat(64)},
            'in_progress'::"ChannelIcalCredentialRotationStatus"
          )
        `;
      }),
    ).rejects.toThrow();

    expect(await countRotationRows(TENANT)).toBe(1);
    expect(await countRotationRows(OTHER_TENANT)).toBe(0);
  });

  it("sweep skips generations whose connection is paused", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      await seedPendingGeneration(1);
      const paused = await connections.findById(TENANT, CONNECTION_ID);
      paused!.pause();
      await connections.pauseWithExpectedSemanticVersion(paused!, 2, "active");

      const logs: Record<string, unknown>[] = [];
      const jobQuery: IIcalInventoryReconcileJobQuery = {
        listJobsForGeneration: async () => [],
      };
      const sweep = new SweepPendingIcalInventoryReconcileUseCase(
        new PrismaPendingIcalInventoryReconciliationReader(),
        jobQuery,
        new EnqueueJobUseCase(
          new PrismaJobScheduler(new PrismaBackgroundJobRepository()),
        ),
        new PrismaChannelConnectionStatusFinder(),
        (fields) => logs.push(fields),
      );

      const result = await sweep.execute();
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().skippedLifecycle).toBeGreaterThanOrEqual(1);
      expect(result.getValue().enqueuedPrimary).toBe(0);
      expect(
        logs.some(
          (entry) =>
            entry.reasonCode === "lifecycle_not_active" &&
            entry.connectionId === CONNECTION_ID,
        ),
      ).toBe(true);
      expect(
        await prisma.backgroundJob.count({ where: { tenantId: TENANT } }),
      ).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
    }
  });

  it("reassigns a mapping unit under pause with epoch bump, baseline reset, and supersession", async () => {
    await seedPendingGeneration(1);
    await seedChannelImportBlock("src-before-remap");

    const paused = await connections.findById(TENANT, CONNECTION_ID);
    paused!.pause();
    await connections.pauseWithExpectedSemanticVersion(paused!, 2, "active");

    const upsert = new UpsertChannelListingMappingUseCase(
      connections,
      mappings,
      new PrismaIcalChannelMappingLifecycleStore(prisma, INTEGRATION_TX_OPTIONS),
      permissionChecker,
      { generate: () => "s6c-mapping-new" },
    );

    const result = await upsert.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext-s6c",
        propertyId: PROPERTY_ID,
        unitId: OTHER_UNIT_ID,
        expectedSemanticConfigVersion: 2,
        reason: "s6c remap",
      },
      adminActor,
      auditContext,
    );
    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.mutationKind).toBe("unit_change");
    expect(value.epochBumped).toBe(true);
    expect(value.resultingSemanticConfigVersion).toBe(3);
    expect(value.cursorBaselineReset).toBe(true);
    expect(value.retainedCursorVersion).toBe(1);
    expect(value.supersededPendingCount).toBe(1);
    expect(value.activeMappingCount).toBe(1);
    expect(value.requiresPollRematerialization).toBe(true);

    expect((await mappings.findById(TENANT, MAPPING_ID))?.unitId).toBe(OTHER_UNIT_ID);
    const cursor = await cursors.getCursor(TENANT, CONNECTION_ID);
    expect(cursor?.payload).toBe(EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD);
    expect(cursor?.version).toBe(1);

    await setTenantContext(prisma, TENANT);
    // Blocks materialized under the old epoch are retained, never deleted.
    const blocks = await prisma.unitCalendarBlock.findMany({
      where: { tenantId: TENANT, blockType: "channel_import" },
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.semanticConfigVersion).toBe(2);
    expect(blocks[0]?.unitId).toBe(UNIT_ID);
    expect(
      await prisma.channelInventoryReconciliation.count({
        where: { tenantId: TENANT, reconcileStatus: "pending" },
      }),
    ).toBe(0);
  });

  it("refuses a unit reassignment while the connection is active", async () => {
    const upsert = new UpsertChannelListingMappingUseCase(
      connections,
      mappings,
      new PrismaIcalChannelMappingLifecycleStore(prisma, INTEGRATION_TX_OPTIONS),
      permissionChecker,
      { generate: () => "s6c-mapping-new" },
    );

    const result = await upsert.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        externalListingId: "ext-s6c",
        propertyId: PROPERTY_ID,
        unitId: OTHER_UNIT_ID,
        expectedSemanticConfigVersion: 2,
      },
      adminActor,
      auditContext,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
    expect((await mappings.findById(TENANT, MAPPING_ID))?.unitId).toBe(UNIT_ID);
    expect(
      (await connections.findById(TENANT, CONNECTION_ID))?.semanticConfigVersion,
    ).toBe(2);
  });

  it("applies a property-only change without touching the epoch or cursor", async () => {
    await seedPendingGeneration(1);
    const upsert = new UpsertChannelListingMappingUseCase(
      connections,
      mappings,
      new PrismaIcalChannelMappingLifecycleStore(prisma, INTEGRATION_TX_OPTIONS),
      permissionChecker,
      { generate: () => "s6c-mapping-new" },
    );

    const result = await upsert.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        externalListingId: "ext-s6c-v2",
        propertyId: PROPERTY_ID,
        unitId: UNIT_ID,
        expectedSemanticConfigVersion: 2,
      },
      adminActor,
      auditContext,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().mutationKind).toBe("external_identity_only");
    expect(result.getValue().epochBumped).toBe(false);
    expect(result.getValue().mappingVersion).toBe(2);

    expect(
      (await connections.findById(TENANT, CONNECTION_ID))?.semanticConfigVersion,
    ).toBe(2);
    expect((await cursors.getCursor(TENANT, CONNECTION_ID))?.payload).toBe(
      "s6c-live-cursor",
    );
    await setTenantContext(prisma, TENANT);
    expect(
      await prisma.channelInventoryReconciliation.count({
        where: { tenantId: TENANT, reconcileStatus: "pending" },
      }),
    ).toBe(1);
  });

  it("missing cursor with historical recon max N chooses nextVersion > N", async () => {
    await seedPendingGeneration(3);
    await seedPendingGeneration(5);
    await setTenantContext(prisma, TENANT);
    await prisma.channelPollCursor.deleteMany({
      where: { tenantId: TENANT, connectionId: CONNECTION_ID },
    });
    expect(await cursors.getCursor(TENANT, CONNECTION_ID)).toBeNull();

    const created = await cursors.advanceCursor({
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 2,
      expectedCursorVersion: 0,
      nextPayload: "s6c-after-missing-cursor",
    });
    expect(created.version).toBe(nextChannelPollCursorVersion(0, 5));
    expect(created.version).toBe(6);
  });

  it("two concurrent cursor creators cannot choose the same nextVersion", async () => {
    await seedPendingGeneration(4);
    await setTenantContext(prisma, TENANT);
    await prisma.channelPollCursor.deleteMany({
      where: { tenantId: TENANT, connectionId: CONNECTION_ID },
    });

    const clientA = new PrismaClient();
    const clientB = new PrismaClient();
    const txOpts = INTEGRATION_TX_OPTIONS;
    try {
      const repoA = new PrismaChannelPollCursorRepository(clientA, txOpts);
      const repoB = new PrismaChannelPollCursorRepository(clientB, txOpts);
      const settled = await Promise.allSettled([
        repoA.advanceCursor({
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          observedSemanticConfigVersion: 2,
          expectedCursorVersion: 0,
          nextPayload: "s6c-concurrent-a",
        }),
        repoB.advanceCursor({
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          observedSemanticConfigVersion: 2,
          expectedCursorVersion: 0,
          nextPayload: "s6c-concurrent-b",
        }),
      ]);

      const fulfilled = settled.filter(
        (s): s is PromiseFulfilledResult<{ version: number }> => s.status === "fulfilled",
      );
      const rejected = settled.filter((s) => s.status === "rejected");
      // Connection FOR UPDATE serializes: one create wins; the other conflicts on CAS.
      expect(fulfilled.length + rejected.length).toBe(2);
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      if (fulfilled.length === 2) {
        const versions = fulfilled.map((s) => s.value.version).sort((a, b) => a - b);
        expect(versions[0]).not.toBe(versions[1]);
        expect(versions[0]).toBeGreaterThan(4);
      } else {
        expect(fulfilled[0]!.value.version).toBeGreaterThan(4);
        expect(rejected).toHaveLength(1);
      }
    } finally {
      await Promise.allSettled([clientA.$disconnect(), clientB.$disconnect()]);
    }
  });

  it("ForceRedrive fails closed while the connection is paused", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      await seedPendingGeneration(1);
      const paused = await connections.findById(TENANT, CONNECTION_ID);
      paused!.pause();
      await connections.pauseWithExpectedSemanticVersion(paused!, 2, "active");

      const reader = new PrismaPendingIcalInventoryReconciliationReader();
      const force = new ForceRedrivePendingIcalInventoryReconcileUseCase(
        new PrismaIcalInventoryReconcileJobQuery(),
        new EnqueueJobUseCase(
          new PrismaJobScheduler(new PrismaBackgroundJobRepository()),
        ),
        (tenantId, connectionId, cursorVersion) =>
          reader.findPending(tenantId, connectionId, cursorVersion),
        new PrismaChannelConnectionStatusFinder(),
      );

      const result = await force.execute({
        tenantId: TENANT,
        connectionId: CONNECTION_ID,
        cursorVersion: 1,
        actorId: ACTOR,
      });
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ConflictError);
      expect(
        await prisma.backgroundJob.count({ where: { tenantId: TENANT } }),
      ).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
    }
  });
});

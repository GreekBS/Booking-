import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
  ChannelConnection,
  ConflictError,
  CredentialReference,
  EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
  FEED_SEMANTIC_MODES,
  IdempotencyConflictError,
  NotFoundError,
  fingerprintSemanticModeTransitionCommand,
  type SemanticModeTransitionCommand,
  type SemanticModeTransitionResult,
} from "@hcp/domain";
import {
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

/** Remote Supabase latency exceeds Prisma's default 5000 ms interactive TX timeout. */
const INTEGRATION_TX_OPTIONS = { maxWait: 20_000, timeout: 60_000 } as const;

function createTransitionStore(
  hooks: ConstructorParameters<typeof PrismaChannelSemanticModeTransitionStore>[1] = {},
  client: ConstructorParameters<typeof PrismaChannelSemanticModeTransitionStore>[0] = prisma,
): PrismaChannelSemanticModeTransitionStore {
  return new PrismaChannelSemanticModeTransitionStore(
    client,
    hooks,
    INTEGRATION_TX_OPTIONS,
  );
}

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440820";
const OTHER_TENANT_ID = "550e8400-e29b-41d4-a716-446655440821";
const ACTOR_ID = "550e8400-e29b-41d4-a716-446655440822";
const OTHER_ACTOR_ID = "550e8400-e29b-41d4-a716-446655440823";
const CONNECTION_ID = "s3d-pg-connection";
const NEWLINE_CONNECTION_ID = "foo\nbar";

function command(
  overrides: Partial<SemanticModeTransitionCommand> = {},
): SemanticModeTransitionCommand {
  return {
    tenantId: TENANT_ID,
    connectionId: CONNECTION_ID,
    commandId: "s3d-cmd-1",
    operation: CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
    actorId: ACTOR_ID,
    expectedFromMode: "mixed_or_unknown_feed",
    targetSemanticMode: "availability_block_feed",
    expectedSemanticConfigVersion: 1,
    allowedFeedSemanticModes: [...FEED_SEMANTIC_MODES],
    reason: "s3d integration",
    ...overrides,
  };
}

async function assertFullyRolledBack(): Promise<void> {
  expect(
    await prisma.channelSemanticTransitionCommand.count({ where: { tenantId: TENANT_ID } }),
  ).toBe(0);
  expect(
    (await new PrismaChannelConnectionRepository().findById(TENANT_ID, CONNECTION_ID))
      ?.semanticConfigVersion,
  ).toBe(1);
  expect(
    (await new PrismaChannelConnectionRepository().findById(TENANT_ID, CONNECTION_ID))
      ?.semanticMode,
  ).toBe("mixed_or_unknown_feed");
  expect(
    await prisma.auditLog.count({
      where: { tenantId: TENANT_ID, action: "channel.connection.semantic_mode_changed" },
    }),
  ).toBe(0);
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
      { id: TENANT_ID, name: "S3d Tenant", slug: "int-s3d-tenant" },
      { id: OTHER_TENANT_ID, name: "S3d Other", slug: "int-s3d-other" },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: ACTOR_ID, email: "s3d@integration.test", name: "S3d Actor" },
      { id: OTHER_ACTOR_ID, email: "s3d-other@integration.test", name: "Other" },
    ],
  });
}

async function seedActiveConnection(tenantId = TENANT_ID, id = CONNECTION_ID): Promise<void> {
  const connections = new PrismaChannelConnectionRepository();
  const connection = ChannelConnection.createDraft({
    id,
    tenantId,
    provider: "manual",
    displayName: "S3d PG",
  });
  connection.attachCredentials(CredentialReference.create("cred_s3d"));
  connection.activate();
  await connections.create(connection);
}

runIntegration("PrismaChannelSemanticModeTransitionStore (S3d)", () => {
  const store = createTransitionStore();
  const connections = new PrismaChannelConnectionRepository();
  const cursors = new PrismaChannelPollCursorRepository();

  beforeEach(async () => {
    await seedTenantGraph();
    await seedActiveConnection();
  });

  afterAll(async () => {
    await seedTenantGraph();
    await prisma.$disconnect();
  });

  it("atomically changes semantic state, resets cursor, audits, and commits receipt", async () => {
    await cursors.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "opaque",
    });

    const result = await store.executeTransition(command());
    expect(result.changed).toBe(true);
    expect(result.newSemanticConfigVersion).toBe(2);
    expect(result.cursorReset).toBe(true);
    expect(result.replayed).toBe(false);

    const connection = await connections.findById(TENANT_ID, CONNECTION_ID);
    expect(connection?.semanticMode).toBe("availability_block_feed");
    expect(connection?.semanticConfigVersion).toBe(2);
    // Baseline reset updates the row in place and retains the durable version.
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).toMatchObject({
      payload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
      version: 1,
      semanticConfigVersion: 2,
    });

    const audits = await prisma.auditLog.findMany({
      where: {
        tenantId: TENANT_ID,
        action: "channel.connection.semantic_mode_changed",
        resourceId: CONNECTION_ID,
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({
      previousMode: "mixed_or_unknown_feed",
      newMode: "availability_block_feed",
      commandId: "s3d-cmd-1",
    });

    const receipt = await prisma.channelSemanticTransitionCommand.findUnique({
      where: {
        tenantId_operation_commandId: {
          tenantId: TENANT_ID,
          operation: CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
          commandId: "s3d-cmd-1",
        },
      },
    });
    expect(receipt?.status).toBe("committed");
    expect(receipt?.changed).toBe(true);
    expect(receipt?.requestFingerprint).toBe(
      fingerprintSemanticModeTransitionCommand(command()),
    );
  });

  it("replays committed commands without duplicate audit or version bump", async () => {
    await store.executeTransition(command());
    const replay = await store.executeTransition(command());
    expect(replay.replayed).toBe(true);
    expect(replay.newSemanticConfigVersion).toBe(2);

    expect(
      await prisma.auditLog.count({
        where: {
          tenantId: TENANT_ID,
          action: "channel.connection.semantic_mode_changed",
        },
      }),
    ).toBe(1);
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion).toBe(
      2,
    );
  });

  it("rejects fingerprint conflicts without side effects", async () => {
    await store.executeTransition(command());
    await expect(
      store.executeTransition(command({ reason: "other reason" })),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT_ID, action: "channel.connection.semantic_mode_changed" },
      }),
    ).toBe(1);
  });

  it("rejects previously colliding newline commands as fingerprint conflicts", async () => {
    await seedActiveConnection(TENANT_ID, NEWLINE_CONNECTION_ID);
    await cursors.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "keep-default",
    });

    // Command A uses a newline-bearing connection id (valid VarChar resource id).
    const commandA = command({
      commandId: "collision-key",
      connectionId: NEWLINE_CONNECTION_ID,
      actorId: ACTOR_ID,
      reason: null,
    });
    // Same durable key; materially different fields. (The historical
    // connectionId/actorId newline split that collided under join("\n") cannot
    // be inserted here because actor_id is UUID-typed; that pair is covered by
    // domain fingerprint + in-memory store tests.)
    const commandB = command({
      commandId: "collision-key",
      connectionId: "foo",
      actorId: ACTOR_ID,
      reason: null,
    });

    expect(fingerprintSemanticModeTransitionCommand(commandA)).not.toBe(
      fingerprintSemanticModeTransitionCommand(commandB),
    );

    const first = await store.executeTransition(commandA);
    expect(first.replayed).toBe(false);
    expect(first.newSemanticConfigVersion).toBe(2);

    await expect(store.executeTransition(commandB)).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    );

    expect(
      (await connections.findById(TENANT_ID, NEWLINE_CONNECTION_ID))?.semanticConfigVersion,
    ).toBe(2);
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion).toBe(
      1,
    );
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).not.toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT_ID, action: "channel.connection.semantic_mode_changed" },
      }),
    ).toBe(1);

    const receipt = await prisma.channelSemanticTransitionCommand.findUnique({
      where: {
        tenantId_operation_commandId: {
          tenantId: TENANT_ID,
          operation: CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
          commandId: "collision-key",
        },
      },
    });
    expect(receipt?.status).toBe("committed");
    expect(receipt?.requestFingerprint).toBe(
      fingerprintSemanticModeTransitionCommand(commandA),
    );
    expect(receipt?.requestFingerprint).not.toBe(
      fingerprintSemanticModeTransitionCommand(commandB),
    );
  });

  it("commits same-mode no-op without audit or cursor reset", async () => {
    await cursors.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "keep",
    });
    const result = await store.executeTransition(
      command({ targetSemanticMode: "mixed_or_unknown_feed", reason: null }),
    );
    expect(result.changed).toBe(false);
    expect(result.cursorReset).toBe(false);
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).not.toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT_ID, action: "channel.connection.semantic_mode_changed" },
      }),
    ).toBe(0);
  });

  it("rolls back completely when semantic CAS is stale", async () => {
    await expect(
      store.executeTransition(command({ expectedSemanticConfigVersion: 9 })),
    ).rejects.toBeInstanceOf(ConflictError);
    await assertFullyRolledBack();
  });

  it("rolls back when failure is injected after receipt acquisition", async () => {
    await cursors.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "receipt-stage",
    });
    const failing = createTransitionStore({
      afterReceiptAcquired: async () => {
        throw new Error("injected receipt-stage failure");
      },
    });

    await expect(
      failing.executeTransition(command({ commandId: "fail-receipt" })),
    ).rejects.toThrow(/injected receipt-stage failure/);
    await assertFullyRolledBack();
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).not.toBeNull();
  });

  it("rolls back when failure is injected after semantic persist", async () => {
    await cursors.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "semantic-stage",
    });
    const failing = createTransitionStore({
      afterSemanticPersist: async () => {
        throw new Error("injected semantic-stage failure");
      },
    });

    await expect(
      failing.executeTransition(command({ commandId: "fail-semantic" })),
    ).rejects.toThrow(/injected semantic-stage failure/);
    await assertFullyRolledBack();
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).not.toBeNull();
  });

  it("rolls back when failure is injected after cursor reset", async () => {
    await cursors.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "cursor-stage",
    });
    const failing = createTransitionStore({
      afterCursorReset: async () => {
        throw new Error("injected cursor-stage failure");
      },
    });

    await expect(
      failing.executeTransition(command({ commandId: "fail-cursor" })),
    ).rejects.toThrow(/injected cursor-stage failure/);
    await assertFullyRolledBack();
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).not.toBeNull();
  });

  it("rolls back when failure is injected after audit insertion", async () => {
    await cursors.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "audit-stage",
    });
    const failing = createTransitionStore({
      afterAudit: async () => {
        throw new Error("injected audit-stage failure");
      },
    });

    await expect(
      failing.executeTransition(command({ commandId: "fail-audit" })),
    ).rejects.toThrow(/injected audit-stage failure/);
    await assertFullyRolledBack();
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).not.toBeNull();
  });

  it("rolls back when failure is injected before receipt commit", async () => {
    await cursors.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "commit-stage",
    });
    const failing = createTransitionStore({
      beforeReceiptCommit: async () => {
        throw new Error("injected commit-stage failure");
      },
    });

    await expect(
      failing.executeTransition(command({ commandId: "fail-commit" })),
    ).rejects.toThrow(/injected commit-stage failure/);
    await assertFullyRolledBack();
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).not.toBeNull();
  });

  it("allows only one of two racing commands at the same expected version", async () => {
    const outcomes = await Promise.allSettled([
      store.executeTransition(command({ commandId: "race-a" })),
      store.executeTransition(
        command({
          commandId: "race-b",
          targetSemanticMode: "reservation_feed",
          reason: "race-b",
        }),
      ),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

    const connection = await connections.findById(TENANT_ID, CONNECTION_ID);
    expect(connection?.semanticConfigVersion).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT_ID, action: "channel.connection.semantic_mode_changed" },
      }),
    ).toBe(1);
    expect(
      await prisma.channelSemanticTransitionCommand.count({
        where: { tenantId: TENANT_ID, status: "committed" },
      }),
    ).toBe(1);
    expect(
      await prisma.channelSemanticTransitionCommand.count({
        where: { tenantId: TENANT_ID, status: "pending" },
      }),
    ).toBe(0);
  });

  it("serializes concurrent identical commands to one transition", async () => {
    // Contending callers: insert winner proceeds; loser either waits for committed
    // replay (FOR UPDATE) or observes in-flight pending and must retry.
    const outcomes = await Promise.allSettled([
      store.executeTransition(command({ commandId: "same-cmd" })),
      store.executeTransition(command({ commandId: "same-cmd" })),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled") as Array<
      PromiseFulfilledResult<SemanticModeTransitionResult>
    >;
    const rejected = outcomes.filter((o) => o.status === "rejected") as Array<
      PromiseRejectedResult
    >;

    expect(fulfilled.length + rejected.length).toBe(2);
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    for (const outcome of fulfilled) {
      expect(outcome.value.newSemanticConfigVersion).toBe(2);
      expect(outcome.value.previousSemanticConfigVersion).toBe(1);
      expect(outcome.value.newMode).toBe("availability_block_feed");
      expect(outcome.value.changed).toBe(true);
    }

    if (fulfilled.length === 2) {
      const replayFlags = fulfilled.map((o) => o.value.replayed).sort();
      expect(replayFlags).toEqual([false, true]);
      expect(fulfilled[0]!.value.committedAt.getTime()).toBe(
        fulfilled[1]!.value.committedAt.getTime(),
      );
    } else {
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toBeInstanceOf(ConflictError);
      expect(String(rejected[0]!.reason)).toMatch(/pending/i);
      const retry = await store.executeTransition(command({ commandId: "same-cmd" }));
      expect(retry.replayed).toBe(true);
      expect(retry.newSemanticConfigVersion).toBe(2);
    }

    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT_ID, action: "channel.connection.semantic_mode_changed" },
      }),
    ).toBe(1);
    expect(
      await prisma.channelSemanticTransitionCommand.count({
        where: { tenantId: TENANT_ID, commandId: "same-cmd", status: "committed" },
      }),
    ).toBe(1);
    expect(
      await prisma.channelSemanticTransitionCommand.count({
        where: { tenantId: TENANT_ID, status: "pending" },
      }),
    ).toBe(0);
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion).toBe(
      2,
    );
  });

  it("rejects concurrent same-key different-fingerprint commands", async () => {
    let releaseLoser!: () => void;
    const loserMayProceed = new Promise<void>((resolve) => {
      releaseLoser = resolve;
    });
    let resolveWinnerHolding!: () => void;
    const winnerHoldingReceipt = new Promise<void>((resolve) => {
      resolveWinnerHolding = resolve;
    });

    const holdingStore = createTransitionStore({
      afterReceiptAcquired: async () => {
        resolveWinnerHolding();
        await loserMayProceed;
      },
    });
    const losingStore = createTransitionStore();

    const commandA = command({ commandId: "fp-race", reason: "winner-a" });
    const commandB = command({ commandId: "fp-race", reason: "winner-b" });

    const winnerPromise = holdingStore.executeTransition(commandA);
    await winnerHoldingReceipt;
    const loserPromise = losingStore.executeTransition(commandB);
    releaseLoser();

    const outcomes = await Promise.allSettled([winnerPromise, loserPromise]);
    const fulfilled = outcomes.filter((o) => o.status === "fulfilled") as Array<
      PromiseFulfilledResult<SemanticModeTransitionResult>
    >;
    const rejected = outcomes.filter((o) => o.status === "rejected") as Array<
      PromiseRejectedResult
    >;

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0]!.value.replayed).toBe(false);
    expect(fulfilled[0]!.value.newSemanticConfigVersion).toBe(2);
    expect(rejected[0]!.reason).toBeInstanceOf(IdempotencyConflictError);

    const receipt = await prisma.channelSemanticTransitionCommand.findUnique({
      where: {
        tenantId_operation_commandId: {
          tenantId: TENANT_ID,
          operation: CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
          commandId: "fp-race",
        },
      },
    });
    expect(receipt?.status).toBe("committed");
    expect(receipt?.requestFingerprint).toBe(
      fingerprintSemanticModeTransitionCommand(commandA),
    );
    expect(receipt?.requestFingerprint).not.toBe(
      fingerprintSemanticModeTransitionCommand(commandB),
    );

    expect(
      await prisma.auditLog.count({
        where: { tenantId: TENANT_ID, action: "channel.connection.semantic_mode_changed" },
      }),
    ).toBe(1);
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion).toBe(
      2,
    );
    expect(
      await prisma.channelSemanticTransitionCommand.count({
        where: { tenantId: TENANT_ID, status: "pending" },
      }),
    ).toBe(0);

    await expect(store.executeTransition(commandB)).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    );
    await expect(store.executeTransition(commandA)).resolves.toMatchObject({
      replayed: true,
      newSemanticConfigVersion: 2,
    });
  });

  it("rejects stale poll cursor commits after transition advances the epoch", async () => {
    await cursors.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "worker",
    });
    await store.executeTransition(command());

    await expect(
      cursors.advanceCursor({
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 1,
        nextPayload: "stale-worker",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("isolates command keys across tenants", async () => {
    await seedActiveConnection(OTHER_TENANT_ID, CONNECTION_ID);
    await store.executeTransition(command({ commandId: "shared-cmd-id" }));
    await store.executeTransition(
      command({
        tenantId: OTHER_TENANT_ID,
        commandId: "shared-cmd-id",
        actorId: OTHER_ACTOR_ID,
      }),
    );

    expect(
      await prisma.channelSemanticTransitionCommand.count({
        where: { commandId: "shared-cmd-id" },
      }),
    ).toBe(2);
  });

  it("returns not found for missing connections and leaves no receipt", async () => {
    await expect(
      store.executeTransition(command({ connectionId: "missing-connection" })),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(
      await prisma.channelSemanticTransitionCommand.count({ where: { tenantId: TENANT_ID } }),
    ).toBe(0);
  });

  it("participates in a caller-owned transaction without nesting", async () => {
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, TENANT_ID);
      const transactional = new PrismaChannelSemanticModeTransitionStore(tx);
      // Caller-owned tx: no nested $transaction / timeout options apply.
      await transactional.executeTransition(command({ commandId: "txn-cmd" }));
    });

    expect(
      (await connections.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion,
    ).toBe(2);
  });
});

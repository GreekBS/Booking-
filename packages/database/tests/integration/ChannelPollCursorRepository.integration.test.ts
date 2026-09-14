import { PrismaClient } from "@prisma/client";
import {
  ConflictError,
  EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
  NotFoundError,
} from "@hcp/domain";
import {
  PrismaChannelPollCursorRepository,
  setTenantContext,
} from "../../src";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./helpers";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const TENANT_A = "550e8400-e29b-41d4-a716-446655440500";
const TENANT_B = "550e8400-e29b-41d4-a716-446655440501";
const CONNECTION_ID = "s3b-cursor-connection";
const OTHER_CONNECTION_ID = "s3b-other-connection";
const TENANT_B_ONLY_CONNECTION_ID = "s3b-tenant-b-only";

function connectionData(tenantId: string, id: string) {
  return {
    tenantId,
    id,
    provider: "manual",
    displayName: "S3b cursor connection",
    status: "draft" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

runIntegration("PrismaChannelPollCursorRepository", () => {
  const repository = new PrismaChannelPollCursorRepository();

  beforeEach(async () => {
    await prisma.channelSemanticTransitionCommand.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.channelPollCursor.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.channelConnection.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.channelConnection.createMany({
      data: [
        connectionData(TENANT_A, CONNECTION_ID),
        connectionData(TENANT_B, CONNECTION_ID),
        connectionData(TENANT_A, OTHER_CONNECTION_ID),
        connectionData(TENANT_B, TENANT_B_ONLY_CONNECTION_ID),
      ],
    });
  });

  afterAll(async () => {
    await prisma.channelSemanticTransitionCommand.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.channelPollCursor.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.channelConnection.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.$disconnect();
  });

  it("loads absence and round-trips an opaque initial payload at version 1", async () => {
    expect(await repository.getCursor(TENANT_A, CONNECTION_ID)).toBeNull();

    const payload = " opaque:\nΩ{\"uninterpreted\":true} ";
    const created = await repository.advanceCursor({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: payload,
    });

    expect(created).toMatchObject({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      payload,
      version: 1,
      semanticConfigVersion: 1,
    });
    expect(await repository.getCursor(TENANT_A, CONNECTION_ID)).toMatchObject({
      payload,
      version: 1,
      semanticConfigVersion: 1,
    });
  });

  it("updates under both CAS tokens and increments exactly once", async () => {
    await repository.advanceCursor({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "first",
    });

    const updated = await repository.advanceCursor({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 1,
      nextPayload: "second",
    });
    expect(updated.version).toBe(2);
    expect(updated.payload).toBe("second");

    await expect(
      repository.advanceCursor({
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 1,
        nextPayload: "stale",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects duplicate create and stale connection semantic epochs", async () => {
    await repository.advanceCursor({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "created",
    });

    await expect(
      repository.advanceCursor({
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 0,
        nextPayload: "duplicate",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    await prisma.channelConnection.update({
      where: {
        tenantId_id: { tenantId: TENANT_A, id: OTHER_CONNECTION_ID },
      },
      data: { semanticConfigVersion: 2 },
    });
    await expect(
      repository.advanceCursor({
        tenantId: TENANT_A,
        connectionId: OTHER_CONNECTION_ID,
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 0,
        nextPayload: "stale-worker-create",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a cursor-row semantic epoch mismatch", async () => {
    await repository.advanceCursor({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "epoch-1",
    });
    await prisma.channelPollCursor.update({
      where: {
        tenantId_connectionId: {
          tenantId: TENANT_A,
          connectionId: CONNECTION_ID,
        },
      },
      data: { semanticConfigVersion: 2 },
    });

    await expect(
      repository.advanceCursor({
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 1,
        nextPayload: "must-fail",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("baseline-resets idempotently and cannot reset another tenant's cursor", async () => {
    await repository.advanceCursor({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "tenant-a",
    });
    await repository.advanceCursor({
      tenantId: TENANT_B,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "tenant-b",
    });

    const baseline = {
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      semanticConfigVersion: 2,
      baselinePayload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
    };
    // The row is updated in place, so the durable version survives and repeats
    // converge on the same state.
    expect(await repository.resetPollCursorBaseline(baseline)).toEqual({
      cursorRowUpdated: true,
      retainedVersion: 1,
    });
    expect(await repository.resetPollCursorBaseline(baseline)).toEqual({
      cursorRowUpdated: true,
      retainedVersion: 1,
    });
    expect(await repository.getCursor(TENANT_A, CONNECTION_ID)).toMatchObject({
      payload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
      version: 1,
      semanticConfigVersion: 2,
    });
    expect(await repository.getCursor(TENANT_B, CONNECTION_ID)).toMatchObject({
      payload: "tenant-b",
      version: 1,
    });

    await expect(
      repository.resetPollCursorBaseline({
        ...baseline,
        connectionId: TENANT_B_ONLY_CONNECTION_ID,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("enforces version checks, composite FK, and cascading delete in PostgreSQL", async () => {
    await expect(
      prisma.channelPollCursor.create({
        data: {
          tenantId: TENANT_A,
          connectionId: CONNECTION_ID,
          payload: "invalid",
          version: 0,
          semanticConfigVersion: 1,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.channelPollCursor.create({
        data: {
          tenantId: TENANT_A,
          connectionId: CONNECTION_ID,
          payload: "invalid-semantic-version",
          version: 1,
          semanticConfigVersion: 0,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.channelPollCursor.create({
        data: {
          tenantId: TENANT_A,
          connectionId: "missing-connection",
          payload: "orphan",
          version: 1,
          semanticConfigVersion: 1,
        },
      }),
    ).rejects.toThrow();

    await repository.advanceCursor({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "cascade",
    });
    await prisma.channelConnection.delete({
      where: { tenantId_id: { tenantId: TENANT_A, id: CONNECTION_ID } },
    });
    expect(
      await prisma.channelPollCursor.count({
        where: { tenantId: TENANT_A, connectionId: CONNECTION_ID },
      }),
    ).toBe(0);
  });

  it("participates in an existing transaction", async () => {
    await prisma.$transaction(async (tx) => {
      const transactionalRepository =
        new PrismaChannelPollCursorRepository(tx);
      const created = await transactionalRepository.advanceCursor({
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 0,
        nextPayload: "transactional",
      });
      expect(created.version).toBe(1);
    });
    expect(await repository.getCursor(TENANT_A, CONNECTION_ID)).not.toBeNull();
  });

  it("behaviorally isolates cursor and command rows under tenant-context RLS", async () => {
    await prisma.channelPollCursor.createMany({
      data: [
        {
          tenantId: TENANT_A,
          connectionId: CONNECTION_ID,
          payload: "tenant-a",
          version: 1,
          semanticConfigVersion: 1,
        },
        {
          tenantId: TENANT_B,
          connectionId: CONNECTION_ID,
          payload: "tenant-b",
          version: 1,
          semanticConfigVersion: 1,
        },
      ],
    });
    await prisma.channelSemanticTransitionCommand.createMany({
      data: [
        {
          tenantId: TENANT_A,
          operation: "rls.probe",
          commandId: "tenant-a",
          connectionId: CONNECTION_ID,
          actorId: "550e8400-e29b-41d4-a716-446655440510",
          expectedFromMode: "mixed_or_unknown_feed",
          targetMode: "availability_block_feed",
          expectedSemanticConfigVersion: 1,
          requestFingerprint: "a".repeat(64),
          status: "pending",
        },
        {
          tenantId: TENANT_B,
          operation: "rls.probe",
          commandId: "tenant-b",
          connectionId: CONNECTION_ID,
          actorId: "550e8400-e29b-41d4-a716-446655440511",
          expectedFromMode: "mixed_or_unknown_feed",
          targetMode: "availability_block_feed",
          expectedSemanticConfigVersion: 1,
          requestFingerprint: "b".repeat(64),
          status: "pending",
        },
      ],
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          "GRANT USAGE ON SCHEMA public TO authenticated",
        );
        await tx.$executeRawUnsafe(
          "GRANT SELECT, INSERT ON channel_poll_cursors, channel_semantic_transition_commands TO authenticated",
        );
        await setTenantContext(tx, TENANT_A);
        await tx.$executeRawUnsafe("SET LOCAL ROLE authenticated");

        const cursorRows = await tx.$queryRaw<Array<{ tenant_id: string }>>`
          SELECT "tenant_id"
          FROM "channel_poll_cursors"
          ORDER BY "tenant_id"
        `;
        const commandRows = await tx.$queryRaw<Array<{ tenant_id: string }>>`
          SELECT "tenant_id"
          FROM "channel_semantic_transition_commands"
          WHERE "operation" = 'rls.probe'
          ORDER BY "tenant_id"
        `;
        expect(cursorRows.map((row) => row.tenant_id)).toEqual([TENANT_A]);
        expect(commandRows.map((row) => row.tenant_id)).toEqual([TENANT_A]);

        await tx.$executeRaw`
          INSERT INTO "channel_semantic_transition_commands" (
            "tenant_id",
            "operation",
            "command_id",
            "connection_id",
            "actor_id",
            "expected_from_mode",
            "target_mode",
            "expected_semantic_config_version",
            "request_fingerprint",
            "status"
          )
          VALUES (
            ${TENANT_B}::uuid,
            'rls.probe',
            'cross-tenant-write',
            ${CONNECTION_ID},
            '550e8400-e29b-41d4-a716-446655440512'::uuid,
            'mixed_or_unknown_feed'::"ChannelFeedSemanticMode",
            'availability_block_feed'::"ChannelFeedSemanticMode",
            1,
            ${"c".repeat(64)},
            'pending'::"ChannelSemanticTransitionCommandStatus"
          )
        `;
      }),
    ).rejects.toThrow();

    expect(
      await prisma.channelSemanticTransitionCommand.count({
        where: { commandId: "cross-tenant-write" },
      }),
    ).toBe(0);
  });

  it("rejects a stale worker after the connection epoch advances", async () => {
    await prisma.channelConnection.update({
      where: { tenantId_id: { tenantId: TENANT_A, id: CONNECTION_ID } },
      data: { semanticConfigVersion: 2 },
    });

    await expect(
      repository.advanceCursor({
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 0,
        nextPayload: "stale-worker",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await repository.getCursor(TENANT_A, CONNECTION_ID)).toBeNull();
  });

  it("serializes cursor commit before a later semantic reset transaction", async () => {
    const firstClient = new PrismaClient();
    const secondClient = new PrismaClient();
    const connectionLocked = deferred();
    const allowCursorCommit = deferred();
    let resetCompleted = false;

    try {
      const cursorCommit = firstClient.$transaction(async (tx) => {
        await setTenantContext(tx, TENANT_A);
        await tx.$queryRaw`
          SELECT "id"
          FROM "channel_connections"
          WHERE "tenant_id" = ${TENANT_A}::uuid
            AND "id" = ${CONNECTION_ID}
          FOR UPDATE
        `;
        connectionLocked.resolve();

        const transactionalRepository =
          new PrismaChannelPollCursorRepository(tx);
        await transactionalRepository.advanceCursor({
          tenantId: TENANT_A,
          connectionId: CONNECTION_ID,
          observedSemanticConfigVersion: 1,
          expectedCursorVersion: 0,
          nextPayload: "commit-first",
        });
        await allowCursorCommit.promise;
      });

      await connectionLocked.promise;
      const semanticReset = secondClient.$transaction(async (tx) => {
        await setTenantContext(tx, TENANT_A);
        await tx.$queryRaw`
          SELECT "id"
          FROM "channel_connections"
          WHERE "tenant_id" = ${TENANT_A}::uuid
            AND "id" = ${CONNECTION_ID}
          FOR UPDATE
        `;
        await tx.channelConnection.update({
          where: {
            tenantId_id: { tenantId: TENANT_A, id: CONNECTION_ID },
          },
          data: { semanticConfigVersion: 2 },
        });
        await new PrismaChannelPollCursorRepository(tx).resetPollCursorBaseline({
          tenantId: TENANT_A,
          connectionId: CONNECTION_ID,
          semanticConfigVersion: 2,
          baselinePayload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
        });
        resetCompleted = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(resetCompleted).toBe(false);
      allowCursorCommit.resolve();
      await cursorCommit;
      await semanticReset;

      // The baseline reset lands after the cursor commit and retains version 1.
      expect(await repository.getCursor(TENANT_A, CONNECTION_ID)).toMatchObject({
        payload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
        version: 1,
        semanticConfigVersion: 2,
      });
      expect(
        (
          await prisma.channelConnection.findUniqueOrThrow({
            where: {
              tenantId_id: { tenantId: TENANT_A, id: CONNECTION_ID },
            },
          })
        ).semanticConfigVersion,
      ).toBe(2);
    } finally {
      allowCursorCommit.resolve();
      await firstClient.$disconnect();
      await secondClient.$disconnect();
    }
  }, 20_000);
});

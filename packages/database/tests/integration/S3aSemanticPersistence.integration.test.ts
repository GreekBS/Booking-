import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./helpers";
import { runIntegration } from "./integrationGate";


runIntegration("CM-4b S3a semantic persistence", () => {
  const tenantId = "550e8400-e29b-41d4-a716-446655440300";
  const actorId = "550e8400-e29b-41d4-a716-446655440301";
  const connectionId = "semantic-connection-non-uuid";

  beforeAll(async () => {
    await prisma.channelSemanticTransitionCommand.deleteMany({
      where: { tenantId },
    });
    await prisma.auditLog.deleteMany({ where: { actorId } });
    await prisma.channelConnection.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });

    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: "S3a Integration Tenant",
        slug: "int-s3a-semantic-persistence",
      },
    });
    await prisma.user.create({
      data: {
        id: actorId,
        email: "s3a-semantic@integration.test",
        name: "S3a Actor",
      },
    });
  });

  afterAll(async () => {
    await prisma.channelSemanticTransitionCommand.deleteMany({
      where: { tenantId },
    });
    await prisma.auditLog.deleteMany({ where: { actorId } });
    await prisma.channelConnection.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("defaults new and backfilled-compatible connections to mixed mode at version 1", async () => {
    const record = await prisma.channelConnection.create({
      data: {
        tenantId,
        id: connectionId,
        provider: "manual",
        displayName: "S3a connection",
        status: "draft",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    expect(record.semanticMode).toBe("mixed_or_unknown_feed");
    expect(record.semanticConfigVersion).toBe(1);
    expect(
      await prisma.channelConnection.count({
        where: { tenantId, semanticMode: "reservation_feed" },
      }),
    ).toBe(0);
  });

  it("preserves UUID audit identities and accepts string resource identities", async () => {
    const uuidResourceId = "550e8400-e29b-41d4-a716-446655440302";

    await prisma.auditLog.createMany({
      data: [
        {
          tenantId,
          actorId,
          action: "s3a.audit.uuid_compatibility",
          resourceType: "TestResource",
          resourceId: uuidResourceId,
          metadata: {},
        },
        {
          tenantId,
          actorId,
          action: "s3a.audit.channel_connection",
          resourceType: "ChannelConnection",
          resourceId: connectionId,
          metadata: {},
        },
      ],
    });

    const rows = await prisma.auditLog.findMany({
      where: {
        actorId,
        action: { startsWith: "s3a.audit." },
      },
      orderBy: { action: "asc" },
    });

    expect(rows.map((row) => row.resourceId).sort()).toEqual(
      [connectionId, uuidResourceId].sort(),
    );
  });

  it("persists the provider-neutral command receipt schema", async () => {
    const receipt = await prisma.channelSemanticTransitionCommand.create({
      data: {
        tenantId,
        operation: "channel.connection.set_semantic_mode",
        commandId: "command-s3a-001",
        connectionId,
        actorId,
        expectedFromMode: "mixed_or_unknown_feed",
        targetMode: "availability_block_feed",
        expectedSemanticConfigVersion: 1,
        requestFingerprint: "a".repeat(64),
        status: "pending",
      },
    });

    expect(receipt.tenantId).toBe(tenantId);
    expect(receipt.commandId).toBe("command-s3a-001");
    expect(receipt.status).toBe("pending");
    expect(receipt.resultingSemanticConfigVersion).toBeNull();
  });

  it("rejects duplicate command receipt composite identities", async () => {
    const data = {
      tenantId,
      operation: "channel.connection.set_semantic_mode",
      commandId: "command-s3a-duplicate",
      connectionId,
      actorId,
      expectedFromMode: "mixed_or_unknown_feed" as const,
      targetMode: "availability_block_feed" as const,
      expectedSemanticConfigVersion: 1,
      requestFingerprint: "c".repeat(64),
      status: "pending" as const,
    };

    await prisma.channelSemanticTransitionCommand.create({ data });
    await expect(
      prisma.channelSemanticTransitionCommand.create({
        data: { ...data, requestFingerprint: "d".repeat(64) },
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid semantic and command version constraints", async () => {
    await expect(
      prisma.channelConnection.create({
        data: {
          tenantId,
          id: "invalid-version-connection",
          provider: "manual",
          displayName: "Invalid version",
          status: "draft",
          semanticConfigVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.channelSemanticTransitionCommand.create({
        data: {
          tenantId,
          operation: "channel.connection.set_semantic_mode",
          commandId: "command-invalid-version",
          connectionId,
          actorId,
          expectedFromMode: "mixed_or_unknown_feed",
          targetMode: "availability_block_feed",
          expectedSemanticConfigVersion: 0,
          requestFingerprint: "b".repeat(64),
          status: "pending",
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.channelSemanticTransitionCommand.create({
        data: {
          tenantId,
          operation: "channel.connection.set_semantic_mode",
          commandId: "command-invalid-fingerprint",
          connectionId,
          actorId,
          expectedFromMode: "mixed_or_unknown_feed",
          targetMode: "availability_block_feed",
          expectedSemanticConfigVersion: 1,
          requestFingerprint: "not-a-sha256-fingerprint",
          status: "pending",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects unknown semantic enum values in PostgreSQL", async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "channel_connections" (
          "tenant_id",
          "id",
          "provider",
          "display_name",
          "status",
          "semantic_mode",
          "semantic_config_version",
          "created_at",
          "updated_at"
        )
        VALUES (
          ${tenantId}::uuid,
          'invalid-mode-connection',
          'manual',
          'Invalid mode',
          'draft'::"ChannelConnectionStatus",
          ${"not_a_mode"}::"ChannelFeedSemanticMode",
          1,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `,
    ).rejects.toThrow();
  });

  it("enables a tenant-scoped RLS policy for command receipts", async () => {
    const tables = await prisma.$queryRaw<
      Array<{ rowsecurity: boolean; forcerowsecurity: boolean }>
    >`
      SELECT
        class.relrowsecurity AS rowsecurity,
        class.relforcerowsecurity AS forcerowsecurity
      FROM pg_class AS class
      INNER JOIN pg_namespace AS namespace
        ON namespace.oid = class.relnamespace
      WHERE namespace.nspname = 'public'
        AND class.relname = 'channel_semantic_transition_commands'
    `;
    const policies = await prisma.$queryRaw<
      Array<{ qual: string | null; with_check: string | null }>
    >`
      SELECT qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'channel_semantic_transition_commands'
        AND policyname = 'tenant_isolation_channel_semantic_transition_commands'
    `;

    expect(tables).toEqual([
      { rowsecurity: true, forcerowsecurity: false },
    ]);
    expect(policies).toHaveLength(1);
    expect(policies[0]?.qual).toContain("app.current_tenant");
    expect(policies[0]?.with_check).toContain("app.current_tenant");
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ChannelConnection,
  ConflictError,
  CredentialReference,
  NotFoundError,
  ValidationError,
} from "@hcp/domain";
import { PrismaChannelConnectionRepository, setTenantContext } from "../../src";
import { prisma } from "./helpers";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440710";
const CONNECTION_ID = "s3c-semantic-connection";

function createActiveDraft(id = CONNECTION_ID) {
  const connection = ChannelConnection.createDraft({
    id,
    tenantId: TENANT_ID,
    provider: "manual",
    displayName: "S3c PG connection",
  });
  connection.attachCredentials(CredentialReference.create("cred_s3c_pg"));
  connection.activate();
  return connection;
}

runIntegration("PrismaChannelConnectionRepository semantic persistence (S3c)", () => {
  const repository = new PrismaChannelConnectionRepository();

  beforeEach(async () => {
    await prisma.channelPollCursor.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.channelConnection.deleteMany({ where: { tenantId: TENANT_ID } });
  });

  afterAll(async () => {
    await prisma.channelPollCursor.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.channelConnection.deleteMany({ where: { tenantId: TENANT_ID } });
    await prisma.$disconnect();
  });

  it("creates and hydrates persisted semantic mode and version strictly", async () => {
    await repository.create(createActiveDraft());
    const found = await repository.findById(TENANT_ID, CONNECTION_ID);
    expect(found?.semanticMode).toBe("mixed_or_unknown_feed");
    expect(found?.semanticConfigVersion).toBe(1);
    expect(found?.provider).toBe("manual");
    expect(found?.status).toBe("active");
  });

  it("relies on database constraints and domain reconstitution to reject invalid semantic values", async () => {
    await expect(
      prisma.channelConnection.create({
        data: {
          tenantId: TENANT_ID,
          id: "invalid-version-row",
          provider: "manual",
          displayName: "Invalid",
          status: "draft",
          semanticConfigVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();

    expect(() =>
      ChannelConnection.reconstitute({
        ...createActiveDraft().toProps(),
        semanticConfigVersion: 0,
      }),
    ).toThrow(ValidationError);
  });

  it("persists semantic state under CAS and rejects stale writers", async () => {
    await repository.create(createActiveDraft());

    await repository.persistSemanticState({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      expectedSemanticConfigVersion: 1,
      semanticMode: "availability_block_feed",
      semanticConfigVersion: 2,
      updatedAt: new Date("2026-07-19T12:00:00Z"),
    });

    const found = await repository.findById(TENANT_ID, CONNECTION_ID);
    expect(found?.semanticMode).toBe("availability_block_feed");
    expect(found?.semanticConfigVersion).toBe(2);

    await expect(
      repository.persistSemanticState({
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
        semanticMode: "reservation_feed",
        semanticConfigVersion: 3,
        updatedAt: new Date("2026-07-19T12:00:01Z"),
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(
      (await repository.findById(TENANT_ID, CONNECTION_ID))?.semanticMode,
    ).toBe("availability_block_feed");
  });

  it("rejects a concurrent stale semantic writer", async () => {
    await repository.create(createActiveDraft());

    const outcomes = await Promise.allSettled([
      repository.persistSemanticState({
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
        semanticMode: "availability_block_feed",
        semanticConfigVersion: 2,
        updatedAt: new Date("2026-07-19T12:10:00Z"),
      }),
      repository.persistSemanticState({
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
        semanticMode: "reservation_feed",
        semanticConfigVersion: 2,
        updatedAt: new Date("2026-07-19T12:10:01Z"),
      }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

    const found = await repository.findById(TENANT_ID, CONNECTION_ID);
    expect(found?.semanticConfigVersion).toBe(2);
    expect(["availability_block_feed", "reservation_feed"]).toContain(found?.semanticMode);
  });

  it("keeps unrelated non-semantic writes from restoring stale semantic epochs", async () => {
    await repository.create(createActiveDraft());
    await repository.persistSemanticState({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      expectedSemanticConfigVersion: 1,
      semanticMode: "reservation_feed",
      semanticConfigVersion: 2,
      updatedAt: new Date("2026-07-19T12:00:00Z"),
    });

    const loaded = await repository.findById(TENANT_ID, CONNECTION_ID);
    const stale = ChannelConnection.reconstitute({
      ...loaded!.toProps(),
      semanticMode: "mixed_or_unknown_feed",
      semanticConfigVersion: 1,
      displayName: "Non-semantic rename",
    });
    await repository.saveNonSemanticChanges(stale);

    const found = await repository.findById(TENANT_ID, CONNECTION_ID);
    expect(found?.displayName).toBe("Non-semantic rename");
    expect(found?.semanticMode).toBe("reservation_feed");
    expect(found?.semanticConfigVersion).toBe(2);
  });

  it("preserves provider immutability on non-semantic updates", async () => {
    await repository.create(createActiveDraft());
    const mutated = ChannelConnection.reconstitute({
      ...(await repository.findById(TENANT_ID, CONNECTION_ID))!.toProps(),
      provider: "airbnb",
      displayName: "Renamed",
    });
    await repository.saveNonSemanticChanges(mutated);

    const found = await repository.findById(TENANT_ID, CONNECTION_ID);
    expect(found?.provider).toBe("manual");
    expect(found?.displayName).toBe("Renamed");
  });

  it("activates and resumes with semantic-version CAS", async () => {
    const draft = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: "manual",
      displayName: "Lifecycle CAS",
    });
    draft.attachCredentials(CredentialReference.create("cred_s3c_pg"));
    await repository.create(draft);

    const pending = await repository.findById(TENANT_ID, CONNECTION_ID);
    pending!.activate();
    await repository.activateWithExpectedSemanticVersion(pending!, 1, "pending_auth");

    await expect(
      repository.activateWithExpectedSemanticVersion(pending!, 1, "pending_auth"),
    ).rejects.toBeInstanceOf(ConflictError);

    const active = await repository.findById(TENANT_ID, CONNECTION_ID);
    const priorActive = active!.status;
    const version = active!.semanticConfigVersion;
    active!.pause();
    await repository.pauseWithExpectedSemanticVersion(active!, version, priorActive);
    const paused = await repository.findById(TENANT_ID, CONNECTION_ID);
    paused!.resume();
    await repository.resumeWithExpectedSemanticVersion(paused!, 1, "paused");
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("active");
  });

  it("omits lifecycle status on non-semantic writes", async () => {
    await repository.create(createActiveDraft());
    const loaded = await repository.findById(TENANT_ID, CONNECTION_ID);
    loaded!.pause();
    await repository.saveNonSemanticChanges(loaded!);
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("active");
  });

  it("participates in a caller-owned transaction without nesting", async () => {
    await prisma.$transaction(async (tx) => {
      const transactional = new PrismaChannelConnectionRepository(tx);
      await transactional.create(createActiveDraft());
      await transactional.persistSemanticState({
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
        semanticMode: "availability_block_feed",
        semanticConfigVersion: 2,
        updatedAt: new Date("2026-07-19T13:00:00Z"),
      });
    });

    expect(
      (await repository.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion,
    ).toBe(2);
  });

  it("preserves tenant context for transactional writes", async () => {
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, TENANT_ID);
      const transactional = new PrismaChannelConnectionRepository(tx);
      await transactional.create(createActiveDraft());
      const found = await transactional.findById(TENANT_ID, CONNECTION_ID);
      expect(found).not.toBeNull();
    });
  });

  it("returns not found for missing non-semantic updates", async () => {
    await expect(
      repository.saveNonSemanticChanges(createActiveDraft("missing-connection")),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

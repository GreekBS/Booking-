import { beforeEach, describe, expect, it } from "vitest";
import {
  ChannelConnection,
  ConflictError,
  CredentialReference,
  NotFoundError,
  ValidationError,
} from "../../src";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440700";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440701";

function createActiveDraft() {
  const connection = ChannelConnection.createDraft({
    id: CONNECTION_ID,
    tenantId: TENANT_ID,
    provider: "manual",
    displayName: "S3c connection",
  });
  connection.attachCredentials(CredentialReference.create("cred_s3c"));
  connection.activate();
  return connection;
}

describe("InMemoryChannelConnectionRepository semantic persistence (S3c)", () => {
  const repository = new InMemoryChannelConnectionRepository();

  beforeEach(() => {
    repository.clear();
  });

  it("creates with fail-closed mixed mode at version 1 and hydrates strictly", async () => {
    await repository.create(createActiveDraft());
    const found = await repository.findById(TENANT_ID, CONNECTION_ID);
    expect(found?.semanticMode).toBe("mixed_or_unknown_feed");
    expect(found?.semanticConfigVersion).toBe(1);
    expect(found?.status).toBe("active");
  });

  it("fails reconstitution when persisted semantic mode or version is invalid", () => {
    const base = createActiveDraft().toProps();
    expect(() =>
      ChannelConnection.reconstitute({
        ...base,
        semanticMode: "not_a_mode" as never,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      ChannelConnection.reconstitute({
        ...base,
        semanticConfigVersion: 0,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      ChannelConnection.reconstitute({
        ...base,
        semanticMode: undefined as never,
        semanticConfigVersion: undefined as never,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects create when aggregate semantic defaults are not mixed/version 1", async () => {
    const connection = createActiveDraft();
    connection.applySemanticModeChange("availability_block_feed");
    await expect(repository.create(connection)).rejects.toBeInstanceOf(ValidationError);
  });

  it("persists semantic state under CAS and rejects stale writers", async () => {
    await repository.create(createActiveDraft());

    await repository.persistSemanticState({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      expectedSemanticConfigVersion: 1,
      semanticMode: "availability_block_feed",
      semanticConfigVersion: 2,
      updatedAt: new Date("2026-07-19T00:00:00Z"),
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
        semanticConfigVersion: 2,
        updatedAt: new Date("2026-07-19T00:00:01Z"),
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const unchanged = await repository.findById(TENANT_ID, CONNECTION_ID);
    expect(unchanged?.semanticMode).toBe("availability_block_feed");
    expect(unchanged?.semanticConfigVersion).toBe(2);
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
        updatedAt: new Date("2026-07-19T00:10:00Z"),
      }),
      repository.persistSemanticState({
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
        semanticMode: "reservation_feed",
        semanticConfigVersion: 2,
        updatedAt: new Date("2026-07-19T00:10:01Z"),
      }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
  });

  it("omits semantic columns on non-semantic writes so stale aggregates cannot restore epochs", async () => {
    await repository.create(createActiveDraft());
    await repository.persistSemanticState({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      expectedSemanticConfigVersion: 1,
      semanticMode: "availability_block_feed",
      semanticConfigVersion: 2,
      updatedAt: new Date("2026-07-19T00:00:00Z"),
    });

    const stale = ChannelConnection.reconstitute({
      ...(await repository.findById(TENANT_ID, CONNECTION_ID))!.toProps(),
      semanticMode: "mixed_or_unknown_feed",
      semanticConfigVersion: 1,
      displayName: "Renamed without semantic restore",
    });
    await repository.saveNonSemanticChanges(stale);

    const found = await repository.findById(TENANT_ID, CONNECTION_ID);
    expect(found?.displayName).toBe("Renamed without semantic restore");
    expect(found?.semanticMode).toBe("availability_block_feed");
    expect(found?.semanticConfigVersion).toBe(2);
  });

  it("activates and resumes only under matching semantic version and status", async () => {
    const connection = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: "manual",
      displayName: "Lifecycle",
    });
    connection.attachCredentials(CredentialReference.create("cred_s3c"));
    await repository.create(connection);

    const pending = await repository.findById(TENANT_ID, CONNECTION_ID);
    pending!.activate();
    await repository.activateWithExpectedSemanticVersion(pending!, 1, "pending_auth");
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.status).toBe("active");

    const active = await repository.findById(TENANT_ID, CONNECTION_ID);
    const priorActive = active!.status;
    const version = active!.semanticConfigVersion;
    active!.pause();
    await repository.pauseWithExpectedSemanticVersion(active!, version, priorActive);

    const paused = await repository.findById(TENANT_ID, CONNECTION_ID);
    paused!.resume();
    await expect(
      repository.resumeWithExpectedSemanticVersion(paused!, 2, "paused"),
    ).rejects.toBeInstanceOf(ConflictError);
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

  it("preserves provider immutability and rejects missing connection updates", async () => {
    await repository.create(createActiveDraft());
    const mutated = ChannelConnection.reconstitute({
      ...(await repository.findById(TENANT_ID, CONNECTION_ID))!.toProps(),
      provider: "airbnb",
      displayName: "Still booking provider",
    });
    await repository.saveNonSemanticChanges(mutated);
    expect((await repository.findById(TENANT_ID, CONNECTION_ID))?.provider).toBe("manual");

    await expect(
      repository.saveNonSemanticChanges(
        ChannelConnection.createDraft({
          id: "missing",
          tenantId: TENANT_ID,
          provider: "manual",
          displayName: "Missing",
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

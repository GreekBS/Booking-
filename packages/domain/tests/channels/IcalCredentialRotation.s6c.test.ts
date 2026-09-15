import { beforeEach, describe, expect, it } from "vitest";
import {
  ActivateChannelConnectionUseCase,
  CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
  ChannelConnection,
  ChannelListingMapping,
  ChannelProviderRegistry,
  ConflictError,
  CredentialReference,
  DeactivateChannelListingMappingUseCase,
  EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
  FEED_SEMANTIC_MODES,
  ForbiddenError,
  ICAL_CREDENTIAL_ROTATION_FINGERPRINT_FORMAT_VERSION,
  IdempotencyConflictError,
  InMemoryChannelConnectionLifecycleUnitOfWork,
  InMemoryChannelConnectionRepository,
  InMemoryChannelCredentialVault,
  InMemoryChannelInventoryReconciliationApplyStore,
  InMemoryChannelListingMappingRepository,
  InMemoryChannelPollCursorRepository,
  InMemoryIcalChannelMappingLifecycleStore,
  InMemoryIcalCredentialRotationStore,
  InMemoryLifecycleAuditLog,
  NotFoundError,
  PermissionChecker,
  PutChannelConnectionCredentialsUseCase,
  ResumeChannelConnectionUseCase,
  RotateIcalConnectionCredentialsUseCase,
  UpsertChannelListingMappingUseCase,
  ValidationError,
  buildCanonicalIcalCredentialRotationFingerprintMaterial,
  buildEmptyIcalCursorBaselinePayload,
  buildIcalCredentialRotationMaterialDigest,
  createProviderCapabilities,
  decodeIcalCursor,
  encodeLengthPrefixedRotationField,
  fingerprintIcalCredentialRotationCommand,
  nextChannelPollCursorVersion,
  withDefaultProviderRegistrationPolicies,
  type ChannelInventoryReconciliationRecord,
  type IChannelCredentialStore,
  type RotateIcalConnectionCredentialsCommand,
} from "../../src";
import { TestChannelPollingProvider } from "../../src/channels/simulation/TestChannelPollingProvider";
import {
  SweepPendingIcalInventoryReconcileUseCase,
  type IIcalInventoryReconcileJobQuery,
  type IPendingIcalInventoryReconciliationReader,
} from "../../src/channels/application/SweepPendingIcalInventoryReconcileUseCase";
import { ForceRedrivePendingIcalInventoryReconcileUseCase } from "../../src/channels/application/ForceRedrivePendingIcalInventoryReconcileUseCase";
import { EnqueueJobUseCase } from "../../src/platform/async/jobs/application/EnqueueJobUseCase";
import type {
  BackgroundJobEntry,
  EnqueueJobCommand,
  IJobScheduler,
} from "../../src/shared/types/index";

const TENANT = "550e8400-e29b-41d4-a716-446655440a00";
const OTHER_TENANT = "550e8400-e29b-41d4-a716-446655440a01";
const CONNECTION = "550e8400-e29b-41d4-a716-446655440a02";
const ACTOR = "550e8400-e29b-41d4-a716-446655440a03";
const MAPPING = "550e8400-e29b-41d4-a716-446655440a04";
const UNIT = "unit-s6c";
const PROPERTY = "prop-s6c";

const FEED_URL = "https://feed.example.test/calendar/secret-token.ics";
const ROTATED_FEED_URL = "https://feed.example.test/calendar/rotated-token.ics";

const adminActor = { userId: ACTOR, role: "admin" as const, propertyIds: null };
const managerActor = {
  userId: "550e8400-e29b-41d4-a716-446655440a05",
  role: "manager" as const,
  propertyIds: ["prop-1"],
};
const auditContext = { actorId: ACTOR, ipAddress: "127.0.0.1" };

function fingerprintInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    operation: CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
    commandId: "rot-1",
    connectionId: CONNECTION,
    actorId: ACTOR,
    expectedSemanticConfigVersion: 2,
    material: { feedUrl: FEED_URL },
    reason: null,
    ...overrides,
  } as Parameters<typeof fingerprintIcalCredentialRotationCommand>[0];
}

describe("P1-S6c rotation fingerprint", () => {
  it("digests material independently of key order", () => {
    const a = buildIcalCredentialRotationMaterialDigest({
      feedUrl: FEED_URL,
      etagHint: "x",
    });
    const b = buildIcalCredentialRotationMaterialDigest({
      etagHint: "x",
      feedUrl: FEED_URL,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when material changes and is unambiguous across delimiters", () => {
    const base = buildIcalCredentialRotationMaterialDigest({ feedUrl: FEED_URL });
    expect(
      buildIcalCredentialRotationMaterialDigest({ feedUrl: ROTATED_FEED_URL }),
    ).not.toBe(base);
    expect(
      buildIcalCredentialRotationMaterialDigest({ "feedUrl=a": "b" }),
    ).not.toBe(buildIcalCredentialRotationMaterialDigest({ feedUrl: "a=b" }));
  });

  it("rejects empty material and empty values", () => {
    expect(() => buildIcalCredentialRotationMaterialDigest({})).toThrow(ValidationError);
    expect(() => buildIcalCredentialRotationMaterialDigest({ feedUrl: "" })).toThrow(
      ValidationError,
    );
  });

  it("never places raw credential material in the fingerprint envelope", () => {
    const material = buildCanonicalIcalCredentialRotationFingerprintMaterial(
      fingerprintInput({ reason: "operator note" }),
    );
    expect(material).not.toContain(FEED_URL);
    expect(material).not.toContain("secret-token");
    expect(material).not.toContain("operator note");
    expect(material).toContain(
      encodeLengthPrefixedRotationField(
        "formatVersion",
        ICAL_CREDENTIAL_ROTATION_FINGERPRINT_FORMAT_VERSION,
      ),
    );
    expect(material).toContain(
      encodeLengthPrefixedRotationField(
        "materialDigest",
        buildIcalCredentialRotationMaterialDigest({ feedUrl: FEED_URL }),
      ),
    );
  });

  it("produces a stable 64-hex digest that changes with each material field", () => {
    const base = fingerprintIcalCredentialRotationCommand(fingerprintInput());
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintIcalCredentialRotationCommand(fingerprintInput())).toBe(base);
    for (const override of [
      { tenantId: OTHER_TENANT },
      { commandId: "rot-2" },
      { connectionId: "other-connection" },
      { actorId: managerActor.userId },
      { expectedSemanticConfigVersion: 3 },
      { material: { feedUrl: ROTATED_FEED_URL } },
      { reason: "ops" },
    ]) {
      expect(fingerprintIcalCredentialRotationCommand(fingerprintInput(override))).not.toBe(
        base,
      );
    }
  });

  it("rejects a foreign operation identity", () => {
    expect(() =>
      fingerprintIcalCredentialRotationCommand(
        fingerprintInput({ operation: "channel.connection.something_else" }),
      ),
    ).toThrow(ValidationError);
  });
});

describe("P1-S6c empty iCal cursor baseline payload", () => {
  it("decodes as a valid empty snapshot index", () => {
    const decoded = decodeIcalCursor(EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD);
    expect(decoded.status).toBe("valid");
    if (decoded.status !== "valid") return;
    expect(decoded.index.groups).toEqual([]);
    expect(decoded.index.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is a non-empty byte-stable payload, not a sentinel", () => {
    expect(EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD.length).toBeGreaterThan(0);
    expect(buildEmptyIcalCursorBaselinePayload()).toBe(EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD);
    expect(EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD).not.toBe("");
    expect(EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD).not.toBe("null");
  });
});

describe("P1-S6c monotonic cursor version helper", () => {
  it("takes max(cursor, reconciliation) + 1", () => {
    expect(nextChannelPollCursorVersion(0, 0)).toBe(1);
    expect(nextChannelPollCursorVersion(null, null)).toBe(1);
    expect(nextChannelPollCursorVersion(5, 3)).toBe(6);
    expect(nextChannelPollCursorVersion(3, 5)).toBe(6);
    expect(nextChannelPollCursorVersion(0, 9)).toBe(10);
  });

  it("never restarts the sequence after a baseline reset", () => {
    // A baseline reset retains the durable cursor version, so the next advance
    // must still exceed every previously issued reconciliation generation.
    const retainedVersion = 7;
    const maxReconciliation = 7;
    expect(nextChannelPollCursorVersion(retainedVersion, maxReconciliation)).toBe(8);
  });

  it("rejects negative or fractional inputs", () => {
    expect(() => nextChannelPollCursorVersion(-1, 0)).toThrow(RangeError);
    expect(() => nextChannelPollCursorVersion(0, 1.5)).toThrow(RangeError);
  });
});

interface RotationHarness {
  connections: InMemoryChannelConnectionRepository;
  cursors: InMemoryChannelPollCursorRepository;
  mappings: InMemoryChannelListingMappingRepository;
  applyStore: InMemoryChannelInventoryReconciliationApplyStore;
  vault: InMemoryChannelCredentialVault;
  rotationStore: InMemoryIcalCredentialRotationStore;
  logs: Record<string, unknown>[];
  rotate: RotateIcalConnectionCredentialsUseCase;
}

function generation(
  overrides: Partial<ChannelInventoryReconciliationRecord> = {},
): ChannelInventoryReconciliationRecord {
  return {
    tenantId: TENANT,
    connectionId: CONNECTION,
    cursorVersion: 1,
    semanticConfigVersion: 2,
    mappingId: MAPPING,
    mappingVersion: 1,
    unitId: UNIT,
    propertyId: PROPERTY,
    snapshotHash: "a".repeat(64),
    actionableSnapshot: [],
    completeObservedEvidence: false,
    observedSourceIdentityKeys: null,
    cancelledSourceIdentityKeys: null,
    reconcileStatus: "pending",
    reconcileErrorCode: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    appliedAt: null,
    ...overrides,
  };
}

/**
 * Seeds an active `availability_block_feed` iCal connection at epoch 2 with one
 * active mapping and a durable poll cursor at version 1.
 */
async function seedHarness(options?: {
  provider?: "ical" | "manual";
  credentialStore?: IChannelCredentialStore;
}): Promise<RotationHarness> {
  const connections = new InMemoryChannelConnectionRepository();
  const cursors = new InMemoryChannelPollCursorRepository(connections);
  const mappings = new InMemoryChannelListingMappingRepository();
  const applyStore = new InMemoryChannelInventoryReconciliationApplyStore(
    connections,
    mappings,
    () => true,
  );
  const vault = new InMemoryChannelCredentialVault();
  const rotationStore = new InMemoryIcalCredentialRotationStore(
    connections,
    cursors,
    applyStore,
  );
  const logs: Record<string, unknown>[] = [];

  const provider = options?.provider ?? "ical";
  const connection = ChannelConnection.createDraft({
    id: CONNECTION,
    tenantId: TENANT,
    provider,
    displayName: "S6c",
  });
  const seededRef = await vault.putCredential(TENANT, { feedUrl: FEED_URL });
  connection.attachCredentials(seededRef);
  connection.activate();
  await connections.create(connection);

  if (provider === "ical") {
    connection.applySemanticModeChange("availability_block_feed");
    await connections.persistSemanticState({
      tenantId: TENANT,
      connectionId: CONNECTION,
      expectedSemanticConfigVersion: 1,
      semanticMode: connection.semanticMode,
      semanticConfigVersion: connection.semanticConfigVersion,
      updatedAt: connection.updatedAt,
    });
    await mappings.save(
      ChannelListingMapping.createActive({
        id: MAPPING,
        tenantId: TENANT,
        connectionId: CONNECTION,
        externalListingId: "ext-listing",
        propertyId: PROPERTY,
        unitId: UNIT,
        syncDirection: "inbound",
      }),
    );
    await cursors.advanceCursor({
      tenantId: TENANT,
      connectionId: CONNECTION,
      observedSemanticConfigVersion: 2,
      expectedCursorVersion: 0,
      nextPayload: "live-cursor-payload",
    });
  }

  const rotate = new RotateIcalConnectionCredentialsUseCase(
    connections,
    rotationStore,
    options?.credentialStore ?? vault,
    new PermissionChecker(),
    (fields) => logs.push(fields),
  );

  return {
    connections,
    cursors,
    mappings,
    applyStore,
    vault,
    rotationStore,
    logs,
    rotate,
  };
}

function rotateCommand(
  overrides: Partial<RotateIcalConnectionCredentialsCommand> = {},
): RotateIcalConnectionCredentialsCommand {
  return {
    tenantId: TENANT,
    connectionId: CONNECTION,
    commandId: "rot-1",
    material: { feedUrl: ROTATED_FEED_URL },
    expectedSemanticConfigVersion: 2,
    reason: "token leaked",
    ...overrides,
  };
}

describe("RotateIcalConnectionCredentialsUseCase (P1-S6c phases 0-5)", () => {
  let harness: RotationHarness;

  beforeEach(async () => {
    harness = await seedHarness();
    harness.applyStore.seedGeneration(generation());
  });

  it("pauses, replaces the credential, bumps the epoch, and does not auto-resume", async () => {
    const result = await harness.rotate.execute(rotateCommand(), adminActor, auditContext);
    expect(result.isSuccess).toBe(true);
    const value = result.getValue();

    expect(value.operation).toBe(CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION);
    expect(value.replayed).toBe(false);
    expect(value.pausedByRotation).toBe(true);
    expect(value.previousSemanticConfigVersion).toBe(2);
    expect(value.resultingSemanticConfigVersion).toBe(3);
    expect(value.supersededPendingCount).toBe(1);
    expect(value.previousCredentialDeleted).toBe(true);

    // Phase 5: no auto-resume.
    expect(value.lifecycleStatus).toBe("paused");
    expect(value.requiresOperatorResume).toBe(true);
    expect(value.requiresPollRematerialization).toBe(true);
    const connection = await harness.connections.findById(TENANT, CONNECTION);
    expect(connection?.status).toBe("paused");
    expect(connection?.semanticConfigVersion).toBe(3);
  });

  it("baseline-resets the cursor while retaining its durable version", async () => {
    const before = await harness.cursors.getCursor(TENANT, CONNECTION);
    expect(before?.version).toBe(1);

    const result = await harness.rotate.execute(rotateCommand(), adminActor, auditContext);
    expect(result.getValue().cursorBaselineReset).toBe(true);
    expect(result.getValue().retainedCursorVersion).toBe(1);

    const after = await harness.cursors.getCursor(TENANT, CONNECTION);
    expect(after?.payload).toBe(EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD);
    expect(after?.version).toBe(1);
    expect(after?.semanticConfigVersion).toBe(3);
  });

  it("supersedes pending reconciliation generations", async () => {
    harness.applyStore.seedGeneration(generation({ cursorVersion: 2 }));
    const result = await harness.rotate.execute(rotateCommand(), adminActor, auditContext);
    expect(result.getValue().supersededPendingCount).toBe(2);
    expect(
      harness.applyStore.getGeneration(TENANT, CONNECTION, 1)?.reconcileStatus,
    ).toBe("superseded");
    expect(
      harness.applyStore.getGeneration(TENANT, CONNECTION, 2)?.reconcileStatus,
    ).toBe("superseded");
  });

  it("records a credential-free receipt and audit entry", async () => {
    await harness.rotate.execute(rotateCommand(), adminActor, auditContext);

    const receipt = await harness.rotationStore.findCommand(TENANT, "rot-1");
    expect(receipt?.status).toBe("committed");
    expect(receipt?.operation).toBe(CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION);
    expect(receipt?.requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt?.newCredentialRef).not.toBeNull();
    expect(JSON.stringify(receipt)).not.toContain("rotated-token");
    expect(JSON.stringify(receipt)).not.toContain("feedUrl");

    const entries = harness.rotationStore.auditLog.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.action).toBe("channel.connection.ical_credentials_rotated");
    expect(entries[0]?.metadata).toMatchObject({
      commandId: "rot-1",
      previousSemanticConfigVersion: 2,
      resultingSemanticConfigVersion: 3,
      credentialRefRotated: true,
      reason: "token leaked",
    });
    expect(JSON.stringify(entries)).not.toContain("rotated-token");
  });

  it("reuses the sealed reference and commits one epoch when retried after the vault write", async () => {
    let putCalls = 0;
    const countingVault: IChannelCredentialStore = {
      putCredential: async (tenantId, material) => {
        putCalls += 1;
        return harness.vault.putCredential(tenantId, material);
      },
      putWebhookVerification: (tenantId, secret) =>
        harness.vault.putWebhookVerification(tenantId, secret),
      deleteSecret: (tenantId, secretId, kind) =>
        harness.vault.deleteSecret(tenantId, secretId, kind),
    };

    // Simulate a crash between phase 2 and phase 3: claim + vault write only.
    const fingerprint = fingerprintIcalCredentialRotationCommand({
      tenantId: TENANT,
      operation: CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
      commandId: "rot-1",
      connectionId: CONNECTION,
      actorId: ACTOR,
      expectedSemanticConfigVersion: 2,
      material: { feedUrl: ROTATED_FEED_URL },
      reason: "token leaked",
    });
    await harness.rotationStore.phase1PauseAndClaimCommand({
      tenantId: TENANT,
      connectionId: CONNECTION,
      commandId: "rot-1",
      actorId: ACTOR,
      requestFingerprint: fingerprint,
      expectedSemanticConfigVersion: 2,
      reason: "token leaked",
      ipAddress: auditContext.ipAddress,
    });
    const sealed = await countingVault.putCredential(TENANT, {
      feedUrl: ROTATED_FEED_URL,
    });
    await harness.rotationStore.markVaultWritten({
      tenantId: TENANT,
      connectionId: CONNECTION,
      commandId: "rot-1",
      newCredentialRef: sealed.value,
    });
    expect(putCalls).toBe(1);

    const retried = new RotateIcalConnectionCredentialsUseCase(
      harness.connections,
      harness.rotationStore,
      countingVault,
      new PermissionChecker(),
    );
    const result = await retried.execute(rotateCommand(), adminActor, auditContext);
    expect(result.isSuccess).toBe(true);
    expect(putCalls).toBe(1);
    expect(result.getValue().resultingSemanticConfigVersion).toBe(3);
    const connection = await harness.connections.findById(TENANT, CONNECTION);
    expect(connection?.credentialRef?.value).toBe(sealed.value);
    expect(connection?.semanticConfigVersion).toBe(3);
  });

  it("replays a committed receipt without a second epoch bump", async () => {
    const first = await harness.rotate.execute(rotateCommand(), adminActor, auditContext);
    expect(first.getValue().replayed).toBe(false);

    const replay = await harness.rotate.execute(rotateCommand(), adminActor, auditContext);
    expect(replay.isSuccess).toBe(true);
    expect(replay.getValue().replayed).toBe(true);
    expect(replay.getValue().resultingSemanticConfigVersion).toBe(3);
    expect(
      (await harness.connections.findById(TENANT, CONNECTION))?.semanticConfigVersion,
    ).toBe(3);
    expect(harness.rotationStore.auditLog.entries).toHaveLength(1);
  });

  it("rejects reuse of a committed commandId with different material", async () => {
    await harness.rotate.execute(rotateCommand(), adminActor, auditContext);
    const conflicting = await harness.rotate.execute(
      rotateCommand({ material: { feedUrl: "https://feed.example.test/third.ics" } }),
      adminActor,
      auditContext,
    );
    expect(conflicting.isFailure).toBe(true);
    expect(conflicting.getError()).toBeInstanceOf(IdempotencyConflictError);
    expect(
      (await harness.connections.findById(TENANT, CONNECTION))?.semanticConfigVersion,
    ).toBe(3);
    expect(harness.rotationStore.auditLog.entries).toHaveLength(1);
  });

  it("rejects a concurrent rotation with a different commandId", async () => {
    const fingerprint = fingerprintIcalCredentialRotationCommand({
      tenantId: TENANT,
      operation: CHANNEL_ICAL_CREDENTIAL_ROTATION_OPERATION,
      commandId: "rot-inflight",
      connectionId: CONNECTION,
      actorId: ACTOR,
      expectedSemanticConfigVersion: 2,
      material: { feedUrl: FEED_URL },
      reason: null,
    });
    await harness.rotationStore.phase1PauseAndClaimCommand({
      tenantId: TENANT,
      connectionId: CONNECTION,
      commandId: "rot-inflight",
      actorId: ACTOR,
      requestFingerprint: fingerprint,
      expectedSemanticConfigVersion: 2,
      reason: null,
    });

    const result = await harness.rotate.execute(rotateCommand(), adminActor, auditContext);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
    expect((result.getError() as ConflictError).message).toMatch(/already in progress/);
    expect(
      (await harness.connections.findById(TENANT, CONNECTION))?.semanticConfigVersion,
    ).toBe(2);
  });

  it("leaves the connection paused with no epoch bump when the vault write fails", async () => {
    const failing = await seedHarness({
      credentialStore: {
        putCredential: async () => {
          throw new Error(`vault unreachable for ${ROTATED_FEED_URL}`);
        },
        putWebhookVerification: async () => {
          throw new Error("unsupported");
        },
        deleteSecret: async () => {},
      },
    });

    const result = await failing.rotate.execute(rotateCommand(), adminActor, auditContext);
    expect(result.isFailure).toBe(true);
    const error = result.getError();
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).not.toContain(ROTATED_FEED_URL);

    const connection = await failing.connections.findById(TENANT, CONNECTION);
    expect(connection?.status).toBe("paused");
    expect(connection?.semanticConfigVersion).toBe(2);

    const receipt = await failing.rotationStore.findCommand(TENANT, "rot-1");
    expect(receipt?.status).toBe("failed");
    expect(receipt?.failureReasonCode).toBe("vault_write_failed");
    expect(failing.rotationStore.auditLog.entries).toHaveLength(0);

    // Logs carry safe reason codes only.
    expect(failing.logs).toHaveLength(1);
    expect(failing.logs[0]).toMatchObject({
      action: "channels.ical_credential_rotation_failed",
      reasonCode: "vault_write_failed",
    });
    expect(JSON.stringify(failing.logs)).not.toContain("rotated-token");
    expect(JSON.stringify(failing.logs)).not.toContain("vault unreachable");
  });

  it("still commits when best-effort cleanup of the old secret fails", async () => {
    const cleanupFailing = await seedHarness({
      credentialStore: {
        putCredential: (tenantId, material) =>
          new InMemoryChannelCredentialVault().putCredential(tenantId, material),
        putWebhookVerification: async () => {
          throw new Error("unsupported");
        },
        deleteSecret: async () => {
          throw new Error("delete boom");
        },
      },
    });

    const result = await cleanupFailing.rotate.execute(
      rotateCommand(),
      adminActor,
      auditContext,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().previousCredentialDeleted).toBe(false);
    expect(result.getValue().resultingSemanticConfigVersion).toBe(3);
    expect(cleanupFailing.logs).toHaveLength(1);
    expect(cleanupFailing.logs[0]).toMatchObject({
      action: "channels.ical_credential_rotation_cleanup_failed",
      reasonCode: "vault_cleanup_failed",
    });
    expect(JSON.stringify(cleanupFailing.logs)).not.toContain("delete boom");
  });

  it("rejects unauthorized actors, foreign providers, stale epochs, and bad material", async () => {
    const forbidden = await harness.rotate.execute(
      rotateCommand(),
      managerActor,
      auditContext,
    );
    expect(forbidden.getError()).toBeInstanceOf(ForbiddenError);

    const missingFeedUrl = await harness.rotate.execute(
      rotateCommand({ material: { token: "abc" } }),
      adminActor,
      auditContext,
    );
    expect(missingFeedUrl.getError()).toBeInstanceOf(ValidationError);

    const stale = await harness.rotate.execute(
      rotateCommand({ expectedSemanticConfigVersion: 99 }),
      adminActor,
      auditContext,
    );
    expect(stale.getError()).toBeInstanceOf(ConflictError);

    const missing = await harness.rotate.execute(
      rotateCommand({ connectionId: "no-such-connection" }),
      adminActor,
      auditContext,
    );
    expect(missing.getError()).toBeInstanceOf(NotFoundError);

    const manual = await seedHarness({ provider: "manual" });
    const providerMismatch = await manual.rotate.execute(
      rotateCommand({ expectedSemanticConfigVersion: 1 }),
      adminActor,
      auditContext,
    );
    expect(providerMismatch.getError()).toBeInstanceOf(ConflictError);
    expect((providerMismatch.getError() as ConflictError).message).toMatch(/only supported/);

    // No failed precheck may mutate the connection.
    expect(
      (await harness.connections.findById(TENANT, CONNECTION))?.semanticConfigVersion,
    ).toBe(2);
    expect((await harness.connections.findById(TENANT, CONNECTION))?.status).toBe("active");
  });

  it("isolates rotation receipts by tenant", async () => {
    await harness.rotate.execute(rotateCommand(), adminActor, auditContext);
    expect(await harness.rotationStore.findCommand(OTHER_TENANT, "rot-1")).toBeNull();
    expect(
      await harness.rotationStore.findInProgressForConnection(OTHER_TENANT, CONNECTION),
    ).toBeNull();
  });
});

describe("PutChannelConnectionCredentialsUseCase iCal fail-closed (P1-S6c)", () => {
  async function buildPut(provider: "ical" | "manual") {
    const connections = new InMemoryChannelConnectionRepository();
    const vault = new InMemoryChannelCredentialVault();
    const audit = new InMemoryLifecycleAuditLog();
    const put = new PutChannelConnectionCredentialsUseCase(
      connections,
      vault,
      new PermissionChecker(),
      audit,
    );
    const connection = ChannelConnection.createDraft({
      id: CONNECTION,
      tenantId: TENANT,
      provider,
      displayName: "S6c put",
    });
    await connections.create(connection);
    return { connections, put, connection };
  }

  async function activateAndMaybePause(
    connections: InMemoryChannelConnectionRepository,
    pause: boolean,
  ) {
    const draft = await connections.findById(TENANT, CONNECTION);
    draft!.attachCredentials(CredentialReference.create("cred_existing"));
    await connections.persistCredentialAttachment(draft!, "draft");
    const attached = await connections.findById(TENANT, CONNECTION);
    attached!.activate();
    await connections.activateWithExpectedSemanticVersion(attached!, 1, "pending_auth");
    if (pause) {
      const active = await connections.findById(TENANT, CONNECTION);
      active!.pause();
      await connections.pauseWithExpectedSemanticVersion(active!, 1, "active");
    }
  }

  it("refuses in-place credential replacement for active iCal connections", async () => {
    const { connections, put } = await buildPut("ical");
    await activateAndMaybePause(connections, false);

    const result = await put.execute(
      { tenantId: TENANT, connectionId: CONNECTION, material: { feedUrl: FEED_URL } },
      adminActor,
      auditContext,
    );
    expect(result.isFailure).toBe(true);
    const error = result.getError() as ConflictError;
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toMatch(/RotateIcalConnectionCredentialsUseCase/);
  });

  it("refuses in-place credential replacement for paused iCal connections", async () => {
    const { connections, put } = await buildPut("ical");
    await activateAndMaybePause(connections, true);

    const result = await put.execute(
      { tenantId: TENANT, connectionId: CONNECTION, material: { feedUrl: FEED_URL } },
      adminActor,
      auditContext,
    );
    expect(result.getError()).toBeInstanceOf(ConflictError);
  });

  it("still allows the draft iCal attach path", async () => {
    const { put } = await buildPut("ical");
    const result = await put.execute(
      { tenantId: TENANT, connectionId: CONNECTION, material: { feedUrl: FEED_URL } },
      adminActor,
      auditContext,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().status).toBe("pending_auth");
  });

  it("leaves non-iCal providers on the in-place replacement path", async () => {
    const { connections, put } = await buildPut("manual");
    await activateAndMaybePause(connections, false);

    const result = await put.execute(
      { tenantId: TENANT, connectionId: CONNECTION, material: { apiKey: "k" } },
      adminActor,
      auditContext,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().status).toBe("active");
  });
});

describe("P1-S6c resume gating and epoch stability", () => {
  let connections: InMemoryChannelConnectionRepository;
  let cursors: InMemoryChannelPollCursorRepository;
  let rotationStore: InMemoryIcalCredentialRotationStore;
  let resume: ResumeChannelConnectionUseCase;
  let activate: ActivateChannelConnectionUseCase;

  beforeEach(async () => {
    connections = new InMemoryChannelConnectionRepository();
    cursors = new InMemoryChannelPollCursorRepository(connections);
    rotationStore = new InMemoryIcalCredentialRotationStore(connections, cursors);
    const auditLog = new InMemoryLifecycleAuditLog();
    const unitOfWork = new InMemoryChannelConnectionLifecycleUnitOfWork(
      connections,
      auditLog,
    );
    const registry = new ChannelProviderRegistry();
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
        allowedFeedSemanticModes: [...FEED_SEMANTIC_MODES],
      }),
    );
    activate = new ActivateChannelConnectionUseCase(
      connections,
      registry,
      new PermissionChecker(),
      unitOfWork,
      rotationStore,
    );
    resume = new ResumeChannelConnectionUseCase(
      connections,
      registry,
      new PermissionChecker(),
      unitOfWork,
      rotationStore,
    );

    const connection = ChannelConnection.createDraft({
      id: CONNECTION,
      tenantId: TENANT,
      provider: "ical",
      displayName: "S6c resume",
    });
    connection.attachCredentials(CredentialReference.create("cred_resume"));
    connection.activate();
    await connections.create(connection);
    const active = await connections.findById(TENANT, CONNECTION);
    active!.pause();
    await connections.pauseWithExpectedSemanticVersion(active!, 1, "active");
  });

  it("pause then resume does not change the semantic epoch", async () => {
    const paused = await connections.findById(TENANT, CONNECTION);
    expect(paused?.status).toBe("paused");
    expect(paused?.semanticConfigVersion).toBe(1);

    const result = await resume.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 1 },
      adminActor,
      auditContext,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().semanticConfigVersion).toBe(1);
    expect(
      (await connections.findById(TENANT, CONNECTION))?.semanticConfigVersion,
    ).toBe(1);
  });

  it("refuses resume and activate while a rotation is in flight", async () => {
    await rotationStore.phase1PauseAndClaimCommand({
      tenantId: TENANT,
      connectionId: CONNECTION,
      commandId: "rot-gate",
      actorId: ACTOR,
      requestFingerprint: "b".repeat(64),
      expectedSemanticConfigVersion: 1,
      reason: null,
    });

    const resumed = await resume.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 1 },
      adminActor,
      auditContext,
    );
    expect(resumed.isFailure).toBe(true);
    const error = resumed.getError() as ConflictError;
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toMatch(/rotation is in progress/);
    expect((await connections.findById(TENANT, CONNECTION))?.status).toBe("paused");

    const activated = await activate.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 1 },
      adminActor,
      auditContext,
    );
    expect(activated.isFailure).toBe(true);
  });

  it("allows resume once the rotation receipt is no longer in progress", async () => {
    await rotationStore.phase1PauseAndClaimCommand({
      tenantId: TENANT,
      connectionId: CONNECTION,
      commandId: "rot-gate",
      actorId: ACTOR,
      requestFingerprint: "b".repeat(64),
      expectedSemanticConfigVersion: 1,
      reason: null,
    });
    await rotationStore.markFailed({
      tenantId: TENANT,
      connectionId: CONNECTION,
      commandId: "rot-gate",
      reasonCode: "operator_abandoned",
    });

    const result = await resume.execute(
      { tenantId: TENANT, connectionId: CONNECTION, expectedSemanticConfigVersion: 1 },
      adminActor,
      auditContext,
    );
    expect(result.isSuccess).toBe(true);
  });
});

class FakeJobScheduler implements IJobScheduler {
  readonly jobs: BackgroundJobEntry[] = [];
  private seq = 0;

  async schedule(command: EnqueueJobCommand): Promise<BackgroundJobEntry> {
    if (command.idempotencyKey) {
      const existing = this.jobs.find(
        (j) => j.jobType === command.jobType && j.idempotencyKey === command.idempotencyKey,
      );
      if (existing) return existing;
    }
    this.seq += 1;
    const job: BackgroundJobEntry = {
      id: `job-${this.seq}`,
      tenantId: command.tenantId ?? null,
      jobType: command.jobType,
      payload: command.payload,
      status: "pending",
      priority: command.priority ?? 0,
      runAt: command.runAt ?? new Date(),
      idempotencyKey: command.idempotencyKey ?? null,
      attemptCount: 0,
      maxAttempts: command.maxAttempts ?? 5,
      createdAt: new Date(Date.now() + this.seq),
    };
    this.jobs.push(job);
    return job;
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === jobId);
    if (job) job.status = "cancelled";
  }
}

describe("P1-S6c async lifecycle gates", () => {
  const pendingRef = {
    tenantId: TENANT,
    connectionId: CONNECTION,
    cursorVersion: 1,
    semanticConfigVersion: 2,
    mappingId: MAPPING,
    mappingVersion: 1,
  };

  function buildSweep(status: "active" | "paused" | null) {
    const scheduler = new FakeJobScheduler();
    const reader: IPendingIcalInventoryReconciliationReader = {
      listPending: async () => [pendingRef],
    };
    const jobQuery: IIcalInventoryReconcileJobQuery = {
      listJobsForGeneration: async () => [],
    };
    const logs: Record<string, unknown>[] = [];
    const sweep = new SweepPendingIcalInventoryReconcileUseCase(
      reader,
      jobQuery,
      new EnqueueJobUseCase(scheduler),
      {
        findStatus: async () => status,
        findRedriveGate: async () =>
          status === null
            ? null
            : { status, inventoryApplyEnabled: true },
      },
      (fields) => logs.push(fields),
    );
    return { sweep, scheduler, logs };
  }

  async function withApplyEnabled(run: () => Promise<void>): Promise<void> {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      await run();
    } finally {
      if (previous === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
    }
  }

  it("sweep skips generations whose connection is not active", async () => {
    await withApplyEnabled(async () => {
      const { sweep, scheduler, logs } = buildSweep("paused");
      const result = await sweep.execute();
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().skippedLifecycle).toBe(1);
      expect(result.getValue().enqueuedPrimary).toBe(0);
      expect(scheduler.jobs).toHaveLength(0);
      expect(logs).toContainEqual(
        expect.objectContaining({
          action: "channels.ical_inventory_reconcile_skipped",
          reasonCode: "lifecycle_not_active",
          connectionStatus: "paused",
        }),
      );
    });
  });

  it("sweep skips generations whose connection is missing", async () => {
    await withApplyEnabled(async () => {
      const { sweep, logs } = buildSweep(null);
      const result = await sweep.execute();
      expect(result.getValue().skippedLifecycle).toBe(1);
      expect(logs[0]).toMatchObject({ connectionStatus: "not_found" });
    });
  });

  it("sweep enqueues normally for active connections", async () => {
    await withApplyEnabled(async () => {
      const { sweep } = buildSweep("active");
      const result = await sweep.execute();
      expect(result.getValue().skippedLifecycle).toBe(0);
      expect(result.getValue().enqueuedPrimary).toBe(1);
    });
  });

  it("force redrive fails closed for non-active and missing connections", async () => {
    await withApplyEnabled(async () => {
      const scheduler = new FakeJobScheduler();
      const enqueue = new EnqueueJobUseCase(scheduler);
      const permissions = new PermissionChecker();
      const auditLog = { append: async () => {} };
      const actor = {
        userId: "op-1",
        role: "admin" as const,
        propertyIds: null,
        isSuperAdmin: true,
      };
      const audit = { actorId: "op-1", ipAddress: null };
      const buildForce = (status: "active" | "paused" | null) =>
        new ForceRedrivePendingIcalInventoryReconcileUseCase(
          { listJobsForGeneration: async () => [] },
          enqueue,
          async () => pendingRef,
          {
            findStatus: async () => status,
            findRedriveGate: async () =>
              status === null
                ? null
                : { status, inventoryApplyEnabled: true },
          },
          permissions,
          auditLog,
        );

      const paused = await buildForce("paused").execute(
        {
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
        },
        actor,
        audit,
      );
      expect(paused.isFailure).toBe(true);
      expect(paused.getError()).toBeInstanceOf(ConflictError);
      expect((paused.getError() as ConflictError).message).toMatch(/active/);

      const missing = await buildForce(null).execute(
        {
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
        },
        actor,
        audit,
      );
      expect(missing.isFailure).toBe(true);
      expect(missing.getError()).toBeInstanceOf(NotFoundError);
      expect(scheduler.jobs).toHaveLength(0);
    });
  });
});

interface MappingHarness {
  connections: InMemoryChannelConnectionRepository;
  cursors: InMemoryChannelPollCursorRepository;
  mappings: InMemoryChannelListingMappingRepository;
  applyStore: InMemoryChannelInventoryReconciliationApplyStore;
  lifecycleStore: InMemoryIcalChannelMappingLifecycleStore;
  upsert: UpsertChannelListingMappingUseCase;
  deactivate: DeactivateChannelListingMappingUseCase;
  pauseConnection: () => Promise<void>;
}

async function seedMappingHarness(): Promise<MappingHarness> {
  const connections = new InMemoryChannelConnectionRepository();
  const cursors = new InMemoryChannelPollCursorRepository(connections);
  const mappings = new InMemoryChannelListingMappingRepository();
  const applyStore = new InMemoryChannelInventoryReconciliationApplyStore(
    connections,
    mappings,
    () => true,
  );
  const lifecycleStore = new InMemoryIcalChannelMappingLifecycleStore(
    connections,
    mappings,
    cursors,
    applyStore,
  );
  let nextId = 0;
  const upsert = new UpsertChannelListingMappingUseCase(
    connections,
    mappings,
    lifecycleStore,
    new PermissionChecker(),
    { generate: () => `mapping-new-${(nextId += 1)}` },
  );
  const deactivate = new DeactivateChannelListingMappingUseCase(
    connections,
    mappings,
    lifecycleStore,
    new PermissionChecker(),
  );

  const connection = ChannelConnection.createDraft({
    id: CONNECTION,
    tenantId: TENANT,
    provider: "ical",
    displayName: "S6c mapping",
  });
  connection.attachCredentials(CredentialReference.create("cred_mapping"));
  connection.activate();
  await connections.create(connection);
  connection.applySemanticModeChange("availability_block_feed");
  await connections.persistSemanticState({
    tenantId: TENANT,
    connectionId: CONNECTION,
    expectedSemanticConfigVersion: 1,
    semanticMode: connection.semanticMode,
    semanticConfigVersion: connection.semanticConfigVersion,
    updatedAt: connection.updatedAt,
  });
  await mappings.save(
    ChannelListingMapping.createActive({
      id: MAPPING,
      tenantId: TENANT,
      connectionId: CONNECTION,
      externalListingId: "ext-listing",
      propertyId: PROPERTY,
      unitId: UNIT,
      syncDirection: "inbound",
    }),
  );
  await cursors.advanceCursor({
    tenantId: TENANT,
    connectionId: CONNECTION,
    observedSemanticConfigVersion: 2,
    expectedCursorVersion: 0,
    nextPayload: "live-cursor-payload",
  });

  const pauseConnection = async () => {
    const active = await connections.findById(TENANT, CONNECTION);
    active!.pause();
    await connections.pauseWithExpectedSemanticVersion(active!, 2, "active");
  };

  return {
    connections,
    cursors,
    mappings,
    applyStore,
    lifecycleStore,
    upsert,
    deactivate,
    pauseConnection,
  };
}

describe("P1-S6c listing mapping lifecycle", () => {
  let harness: MappingHarness;

  beforeEach(async () => {
    harness = await seedMappingHarness();
    harness.applyStore.seedGeneration(generation());
  });

  function baseUpsert(overrides: Record<string, unknown> = {}) {
    return {
      tenantId: TENANT,
      connectionId: CONNECTION,
      externalListingId: "ext-listing",
      propertyId: PROPERTY,
      unitId: UNIT,
      expectedSemanticConfigVersion: 2,
      ...overrides,
    } as Parameters<UpsertChannelListingMappingUseCase["execute"]>[0];
  }

  it("property-only change bumps mappingVersion without an epoch bump", async () => {
    const result = await harness.upsert.execute(
      baseUpsert({ propertyId: "prop-moved" }),
      adminActor,
      auditContext,
    );
    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.mutationKind).toBe("property_only");
    expect(value.epochBumped).toBe(false);
    expect(value.resultingSemanticConfigVersion).toBe(2);
    expect(value.cursorBaselineReset).toBe(false);
    expect(value.supersededPendingCount).toBe(0);
    expect(value.mappingVersion).toBe(2);
    expect(value.requiresPollRematerialization).toBe(true);

    const cursor = await harness.cursors.getCursor(TENANT, CONNECTION);
    expect(cursor?.payload).toBe("live-cursor-payload");
    expect(
      harness.applyStore.getGeneration(TENANT, CONNECTION, 1)?.reconcileStatus,
    ).toBe("pending");
  });

  it("external-identity-only change bumps mappingVersion without an epoch bump", async () => {
    const result = await harness.upsert.execute(
      baseUpsert({ mappingId: MAPPING, externalListingId: "ext-listing-v2" }),
      adminActor,
      auditContext,
    );
    expect(result.getValue().mutationKind).toBe("external_identity_only");
    expect(result.getValue().epochBumped).toBe(false);
    expect(result.getValue().mappingVersion).toBe(2);
    expect(
      (await harness.connections.findById(TENANT, CONNECTION))?.semanticConfigVersion,
    ).toBe(2);
  });

  it("unit reassignment requires a paused connection", async () => {
    const active = await harness.upsert.execute(
      baseUpsert({ unitId: "unit-other" }),
      adminActor,
      auditContext,
    );
    expect(active.isFailure).toBe(true);
    expect(active.getError()).toBeInstanceOf(ConflictError);
    expect((active.getError() as ConflictError).message).toMatch(/while connection is active/);
    expect(
      (await harness.mappings.findById(TENANT, MAPPING))?.unitId,
    ).toBe(UNIT);
  });

  it("unit reassignment under pause bumps the epoch, resets the baseline, and supersedes", async () => {
    await harness.pauseConnection();
    const result = await harness.upsert.execute(
      baseUpsert({ unitId: "unit-other" }),
      adminActor,
      auditContext,
    );
    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.mutationKind).toBe("unit_change");
    expect(value.epochBumped).toBe(true);
    expect(value.previousSemanticConfigVersion).toBe(2);
    expect(value.resultingSemanticConfigVersion).toBe(3);
    expect(value.cursorBaselineReset).toBe(true);
    expect(value.retainedCursorVersion).toBe(1);
    expect(value.supersededPendingCount).toBe(1);

    const cursor = await harness.cursors.getCursor(TENANT, CONNECTION);
    expect(cursor?.payload).toBe(EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD);
    expect(cursor?.version).toBe(1);
    expect(
      harness.applyStore.getGeneration(TENANT, CONNECTION, 1)?.reconcileStatus,
    ).toBe("superseded");
  });

  it("replacement archives the old mapping and activates the new one in one mutation", async () => {
    await harness.pauseConnection();
    const result = await harness.upsert.execute(
      baseUpsert({
        replaceMappingId: MAPPING,
        externalListingId: "ext-listing-replacement",
        unitId: "unit-other",
      }),
      adminActor,
      auditContext,
    );
    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.mutationKind).toBe("replacement");
    expect(value.epochBumped).toBe(true);
    expect(value.deactivatedMappingId).toBe(MAPPING);
    expect(value.activeMappingCount).toBe(1);
    expect((await harness.mappings.findById(TENANT, MAPPING))?.status).toBe("archived");
    expect((await harness.mappings.findById(TENANT, value.mappingId!))?.status).toBe(
      "active",
    );
  });

  it("preserves exactly-one-active for availability_block_feed connections", async () => {
    await harness.pauseConnection();
    const result = await harness.upsert.execute(
      baseUpsert({
        externalListingId: "ext-listing-second",
        unitId: "unit-second",
      }),
      adminActor,
      auditContext,
    );
    expect(result.isFailure).toBe(true);
    const error = result.getError() as ConflictError;
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.message).toMatch(/at most one active listing mapping/);
    expect(await harness.mappings.listByConnection(TENANT, CONNECTION)).toHaveLength(1);
  });

  it("deactivating an active mapping requires pause and bumps the epoch", async () => {
    const whileActive = await harness.deactivate.execute(
      { tenantId: TENANT, connectionId: CONNECTION, mappingId: MAPPING, expectedSemanticConfigVersion: 2 },
      adminActor,
      auditContext,
    );
    expect(whileActive.isFailure).toBe(true);
    expect(whileActive.getError()).toBeInstanceOf(ConflictError);

    await harness.pauseConnection();
    const result = await harness.deactivate.execute(
      { tenantId: TENANT, connectionId: CONNECTION, mappingId: MAPPING, expectedSemanticConfigVersion: 2 },
      adminActor,
      auditContext,
    );
    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.mode).toBe("paused");
    expect(value.epochBumped).toBe(true);
    expect(value.resultingSemanticConfigVersion).toBe(3);
    expect(value.deactivatedMappingId).toBe(MAPPING);
    expect(value.activeMappingCount).toBe(0);
    expect((await harness.mappings.findById(TENANT, MAPPING))?.status).toBe("paused");
    expect(
      harness.applyStore.getGeneration(TENANT, CONNECTION, 1)?.reconcileStatus,
    ).toBe("superseded");
    expect(harness.lifecycleStore.auditLog.entries[0]?.action).toBe(
      "channel.connection.listing_mapping_deactivated",
    );
    expect(harness.lifecycleStore.auditLog.entries[0]?.metadata).toMatchObject({
      previousMappingStatus: "active",
      mode: "paused",
    });
  });

  it("deactivating an already-inactive mapping does not bump the epoch", async () => {
    await harness.pauseConnection();
    await harness.deactivate.execute(
      { tenantId: TENANT, connectionId: CONNECTION, mappingId: MAPPING, expectedSemanticConfigVersion: 2 },
      adminActor,
      auditContext,
    );
    const second = await harness.deactivate.execute(
      {
        tenantId: TENANT,
        connectionId: CONNECTION,
        mappingId: MAPPING,
        mode: "archived",
        expectedSemanticConfigVersion: 3,
      },
      adminActor,
      auditContext,
    );
    expect(second.isSuccess).toBe(true);
    expect(second.getValue().epochBumped).toBe(false);
    expect(second.getValue().resultingSemanticConfigVersion).toBe(3);
    expect((await harness.mappings.findById(TENANT, MAPPING))?.status).toBe("archived");
  });

  it("rejects unauthorized actors and stale epochs without mutating", async () => {
    const forbidden = await harness.upsert.execute(
      baseUpsert({ propertyId: "prop-moved" }),
      managerActor,
      auditContext,
    );
    expect(forbidden.getError()).toBeInstanceOf(ForbiddenError);

    const stale = await harness.upsert.execute(
      baseUpsert({ propertyId: "prop-moved", expectedSemanticConfigVersion: 99 }),
      adminActor,
      auditContext,
    );
    expect(stale.getError()).toBeInstanceOf(ConflictError);
    expect((await harness.mappings.findById(TENANT, MAPPING))?.propertyId).toBe(PROPERTY);
    expect((await harness.mappings.findById(TENANT, MAPPING))?.mappingVersion).toBe(1);
  });
});

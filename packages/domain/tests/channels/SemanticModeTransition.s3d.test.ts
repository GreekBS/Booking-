import { describe, expect, it, beforeEach } from "vitest";
import {
  CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
  ConflictError,
  CredentialReference,
  ChannelConnection,
  EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
  FEED_SEMANTIC_MODES,
  IdempotencyConflictError,
  PersistenceCorruptionError,
  SEMANTIC_MODE_TRANSITION_FINGERPRINT_FORMAT_VERSION,
  fingerprintSemanticModeTransitionCommand,
  buildCanonicalSemanticModeTransitionFingerprintMaterial,
  encodeLengthPrefixedFingerprintField,
  normalizeSemanticTransitionReasonDigest,
  InMemoryChannelConnectionRepository,
  InMemoryChannelPollCursorRepository,
  InMemoryChannelSemanticModeTransitionStore,
  InMemoryTransitionAuditLog,
  type SemanticModeTransitionCommand,
} from "../../src";
import { sha256HexUtf8, utf8ByteLength } from "../../src/channels/utils/sha256Hex";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440800";
const CONNECTION_ID = "s3d-connection";
const ACTOR_ID = "550e8400-e29b-41d4-a716-446655440801";

function baseCommand(
  overrides: Partial<SemanticModeTransitionCommand> = {},
): SemanticModeTransitionCommand {
  return {
    tenantId: TENANT_ID,
    connectionId: CONNECTION_ID,
    commandId: "command-1",
    operation: CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
    actorId: ACTOR_ID,
    expectedFromMode: "mixed_or_unknown_feed",
    targetSemanticMode: "availability_block_feed",
    expectedSemanticConfigVersion: 1,
    allowedFeedSemanticModes: [...FEED_SEMANTIC_MODES],
    reason: null,
    ...overrides,
  };
}

describe("pure SHA-256 (S3d)", () => {
  it("matches known-answer vectors", () => {
    expect(sha256HexUtf8("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256HexUtf8("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("handles UTF-8, padding boundaries, and multi-block input", () => {
    expect(sha256HexUtf8("καλημέρα")).toMatch(/^[0-9a-f]{64}$/);
    for (const len of [55, 56, 63, 64, 65, 200]) {
      expect(sha256HexUtf8("a".repeat(len))).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("computes UTF-8 byte lengths, not JS string lengths", () => {
    expect(utf8ByteLength("a")).toBe(1);
    expect(utf8ByteLength("α")).toBe(2);
    expect(utf8ByteLength("😀")).toBe(4);
    expect("😀".length).toBe(2);
  });
});

describe("semantic mode transition fingerprint (S3d)", () => {
  it("produces a stable 64-char lowercase hex digest", () => {
    const digest = fingerprintSemanticModeTransitionCommand(baseCommand());
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintSemanticModeTransitionCommand(baseCommand())).toBe(digest);
  });

  it("is independent of object property order", () => {
    const a = fingerprintSemanticModeTransitionCommand(baseCommand());
    const b = fingerprintSemanticModeTransitionCommand({
      reason: null,
      allowedFeedSemanticModes: [...FEED_SEMANTIC_MODES],
      expectedSemanticConfigVersion: 1,
      targetSemanticMode: "availability_block_feed",
      expectedFromMode: "mixed_or_unknown_feed",
      actorId: ACTOR_ID,
      operation: CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
      commandId: "command-1",
      connectionId: CONNECTION_ID,
      tenantId: TENANT_ID,
    });
    expect(a).toBe(b);
  });

  it("uses length-prefixed v1 envelope with fixed field order", () => {
    const material = buildCanonicalSemanticModeTransitionFingerprintMaterial(
      baseCommand({ reason: "  note  " }),
    );
    expect(material.startsWith(encodeLengthPrefixedFingerprintField(
      "formatVersion",
      SEMANTIC_MODE_TRANSITION_FINGERPRINT_FORMAT_VERSION,
    ))).toBe(true);
    expect(material).toContain(
      encodeLengthPrefixedFingerprintField("tenantId", TENANT_ID),
    );
    expect(material).toContain(
      encodeLengthPrefixedFingerprintField(
        "operation",
        CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
      ),
    );
    expect(material).toContain(
      encodeLengthPrefixedFingerprintField("commandId", "command-1"),
    );
    expect(material).toContain(
      encodeLengthPrefixedFingerprintField("connectionId", CONNECTION_ID),
    );
    expect(material).toContain(
      encodeLengthPrefixedFingerprintField("actorId", ACTOR_ID),
    );
    expect(material).toContain(
      encodeLengthPrefixedFingerprintField(
        "expectedFromMode",
        "mixed_or_unknown_feed",
      ),
    );
    expect(material).toContain(
      encodeLengthPrefixedFingerprintField("expectedSemanticConfigVersion", "1"),
    );
    expect(material).toContain(
      encodeLengthPrefixedFingerprintField(
        "targetSemanticMode",
        "availability_block_feed",
      ),
    );
    expect(material).toContain(
      encodeLengthPrefixedFingerprintField(
        "reasonDigest",
        normalizeSemanticTransitionReasonDigest("  note  "),
      ),
    );
    expect(material.includes("\n")).toBe(false);
  });

  it("distinguishes previously colliding newline boundary commands", () => {
    const commandA = baseCommand({
      commandId: "shared-key",
      connectionId: "foo\nbar",
      actorId: "baz",
    });
    const commandB = baseCommand({
      commandId: "shared-key",
      connectionId: "foo",
      actorId: "bar\nbaz",
    });
    const materialA = buildCanonicalSemanticModeTransitionFingerprintMaterial(commandA);
    const materialB = buildCanonicalSemanticModeTransitionFingerprintMaterial(commandB);
    expect(materialA).not.toBe(materialB);
    expect(fingerprintSemanticModeTransitionCommand(commandA)).not.toBe(
      fingerprintSemanticModeTransitionCommand(commandB),
    );
  });

  it("is unambiguous for delimiter and multi-byte values", () => {
    const cases: Array<Partial<SemanticModeTransitionCommand>> = [
      { connectionId: "has\nnewline" },
      { connectionId: "has\rcarriage" },
      { connectionId: "has\r\ncrlf" },
      { connectionId: "has:colon" },
      { connectionId: "12:looks-like-prefix" },
      { connectionId: "α" },
      { connectionId: "😀" },
      { actorId: "actor:with:colons" },
      { commandId: "cmd\nwith\nlines" },
    ];
    const base = fingerprintSemanticModeTransitionCommand(baseCommand());
    const seen = new Set<string>([base]);
    for (const override of cases) {
      const digest = fingerprintSemanticModeTransitionCommand(baseCommand(override));
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
      expect(seen.has(digest)).toBe(false);
      seen.add(digest);
    }
  });

  it("uses UTF-8 byte lengths in the envelope", () => {
    const material = buildCanonicalSemanticModeTransitionFingerprintMaterial(
      baseCommand({ connectionId: "α" }),
    );
    expect(material).toContain(
      encodeLengthPrefixedFingerprintField("connectionId", "α"),
    );
    expect(encodeLengthPrefixedFingerprintField("connectionId", "α")).toBe(
      `12:connectionId2:α`,
    );
    expect(encodeLengthPrefixedFingerprintField("connectionId", "😀")).toBe(
      `12:connectionId4:😀`,
    );
  });

  it("changes when each material command field changes", () => {
    const base = fingerprintSemanticModeTransitionCommand(baseCommand());
    expect(
      fingerprintSemanticModeTransitionCommand(baseCommand({ tenantId: TENANT_ID.replace("8", "9") })),
    ).not.toBe(base);
    expect(
      fingerprintSemanticModeTransitionCommand(baseCommand({ connectionId: "other-connection" })),
    ).not.toBe(base);
    expect(
      fingerprintSemanticModeTransitionCommand(baseCommand({ commandId: "other" })),
    ).not.toBe(base);
    expect(
      fingerprintSemanticModeTransitionCommand(baseCommand({ actorId: ACTOR_ID.replace("8", "9") })),
    ).not.toBe(base);
    expect(
      fingerprintSemanticModeTransitionCommand(
        baseCommand({ targetSemanticMode: "reservation_feed" }),
      ),
    ).not.toBe(base);
    expect(
      fingerprintSemanticModeTransitionCommand(
        baseCommand({ expectedSemanticConfigVersion: 2 }),
      ),
    ).not.toBe(base);
    expect(
      fingerprintSemanticModeTransitionCommand(baseCommand({ reason: "ops" })),
    ).not.toBe(base);
  });

  it("treats absent and blank reasons as the same digest by contract", () => {
    expect(normalizeSemanticTransitionReasonDigest(null)).toBe("");
    expect(normalizeSemanticTransitionReasonDigest(undefined)).toBe("");
    expect(normalizeSemanticTransitionReasonDigest("")).toBe("");
    expect(normalizeSemanticTransitionReasonDigest("   ")).toBe("");
    expect(
      fingerprintSemanticModeTransitionCommand(baseCommand({ reason: null })),
    ).toBe(fingerprintSemanticModeTransitionCommand(baseCommand({ reason: undefined })));
    expect(
      fingerprintSemanticModeTransitionCommand(baseCommand({ reason: null })),
    ).toBe(fingerprintSemanticModeTransitionCommand(baseCommand({ reason: "" })));
  });
});

describe("InMemoryChannelSemanticModeTransitionStore (S3d)", () => {
  let connections: InMemoryChannelConnectionRepository;
  let cursors: InMemoryChannelPollCursorRepository;
  let auditLog: InMemoryTransitionAuditLog;
  let store: InMemoryChannelSemanticModeTransitionStore;

  beforeEach(async () => {
    connections = new InMemoryChannelConnectionRepository();
    cursors = new InMemoryChannelPollCursorRepository(connections);
    auditLog = new InMemoryTransitionAuditLog();
    store = new InMemoryChannelSemanticModeTransitionStore(connections, cursors, auditLog);

    const connection = ChannelConnection.createDraft({
      id: CONNECTION_ID,
      tenantId: TENANT_ID,
      provider: "manual",
      displayName: "S3d",
    });
    connection.attachCredentials(CredentialReference.create("cred"));
    connection.activate();
    await connections.create(connection);
    await cursors.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "cursor",
    });
  });

  it("commits a changed transition once and replays the original result", async () => {
    const first = await store.executeTransition(baseCommand());
    expect(first.changed).toBe(true);
    expect(first.newSemanticConfigVersion).toBe(2);
    expect(first.cursorReset).toBe(true);
    expect(first.replayed).toBe(false);
    expect(auditLog.entries).toHaveLength(1);
    // Baseline reset keeps the cursor row and its monotonic version.
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).toMatchObject({
      payload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
      version: 1,
      semanticConfigVersion: 2,
    });

    await store.executeTransition(
      baseCommand({
        commandId: "command-2",
        expectedFromMode: "availability_block_feed",
        targetSemanticMode: "reservation_feed",
        expectedSemanticConfigVersion: 2,
      }),
    );
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion).toBe(
      3,
    );

    const replay = await store.executeTransition(baseCommand());
    expect(replay.replayed).toBe(true);
    expect(replay.newSemanticConfigVersion).toBe(2);
    expect(replay.newMode).toBe("availability_block_feed");
    expect(auditLog.entries).toHaveLength(2);
  });

  it("rejects fingerprint conflicts without mutation", async () => {
    await store.executeTransition(baseCommand());
    await expect(
      store.executeTransition(baseCommand({ reason: "different" })),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion).toBe(
      2,
    );
    expect(auditLog.entries).toHaveLength(1);
  });

  it("rejects previously colliding newline commands as fingerprint conflicts", async () => {
    const newlineConnection = ChannelConnection.createDraft({
      id: "foo\nbar",
      tenantId: TENANT_ID,
      provider: "manual",
      displayName: "Newline",
    });
    newlineConnection.attachCredentials(CredentialReference.create("cred-nl"));
    newlineConnection.activate();
    await connections.create(newlineConnection);

    const commandA = baseCommand({
      commandId: "collision-key",
      connectionId: "foo\nbar",
      actorId: "baz",
    });
    const commandB = baseCommand({
      commandId: "collision-key",
      connectionId: "foo",
      actorId: "bar\nbaz",
    });

    const first = await store.executeTransition(commandA);
    expect(first.replayed).toBe(false);
    expect(first.newSemanticConfigVersion).toBe(2);

    await expect(store.executeTransition(commandB)).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    );
    expect((await connections.findById(TENANT_ID, "foo\nbar"))?.semanticConfigVersion).toBe(2);
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion).toBe(
      1,
    );
    expect(auditLog.entries).toHaveLength(1);
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).not.toBeNull();
  });

  it("treats same-mode as committed no-op without audit or cursor reset", async () => {
    const result = await store.executeTransition(
      baseCommand({
        targetSemanticMode: "mixed_or_unknown_feed",
      }),
    );
    expect(result.changed).toBe(false);
    expect(result.cursorReset).toBe(false);
    expect(result.newSemanticConfigVersion).toBe(1);
    expect(auditLog.entries).toHaveLength(0);
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).not.toBeNull();

    const replay = await store.executeTransition(
      baseCommand({
        targetSemanticMode: "mixed_or_unknown_feed",
      }),
    );
    expect(replay.replayed).toBe(true);
    expect(replay.changed).toBe(false);
  });

  it("rejects stale semantic versions and rolls back receipt", async () => {
    await expect(
      store.executeTransition(baseCommand({ expectedSemanticConfigVersion: 9 })),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.semanticMode).toBe(
      "mixed_or_unknown_feed",
    );
    expect(auditLog.entries).toHaveLength(0);

    const retry = await store.executeTransition(baseCommand());
    expect(retry.changed).toBe(true);
    expect(retry.replayed).toBe(false);
  });

  it("rolls back semantic mutation when a later hook fails", async () => {
    const failing = new InMemoryChannelSemanticModeTransitionStore(
      connections,
      cursors,
      auditLog,
      {
        afterCursorReset: async () => {
          throw new Error("injected cursor failure");
        },
      },
    );

    await expect(failing.executeTransition(baseCommand())).rejects.toThrow(
      /injected cursor failure/,
    );
    expect((await connections.findById(TENANT_ID, CONNECTION_ID))?.semanticConfigVersion).toBe(
      1,
    );
    expect(await cursors.getCursor(TENANT_ID, CONNECTION_ID)).not.toBeNull();
    expect(auditLog.entries).toHaveLength(0);

    const recovered = await store.executeTransition(baseCommand());
    expect(recovered.changed).toBe(true);
  });

  it("rejects corrupt committed receipts without replaying", async () => {
    const corruptStore = store as unknown as {
      receipts: Map<string, Record<string, unknown>>;
    };
    const key = `${TENANT_ID}:${CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION}:corrupt`;
    corruptStore.receipts.set(key, {
      tenantId: TENANT_ID,
      operation: CHANNEL_SEMANTIC_MODE_TRANSITION_OPERATION,
      commandId: "corrupt",
      connectionId: CONNECTION_ID,
      actorId: ACTOR_ID,
      expectedFromMode: "mixed_or_unknown_feed",
      targetMode: "availability_block_feed",
      expectedSemanticConfigVersion: 1,
      requestFingerprint: fingerprintSemanticModeTransitionCommand(
        baseCommand({ commandId: "corrupt" }),
      ),
      status: "committed",
      previousSemanticConfigVersion: null,
      resultingSemanticConfigVersion: null,
      changed: true,
      cursorReset: true,
      committedAt: null,
      createdAt: new Date(),
    });

    await expect(
      store.executeTransition(baseCommand({ commandId: "corrupt" })),
    ).rejects.toBeInstanceOf(PersistenceCorruptionError);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "../../src/shared/errors/DomainError";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelPollCursorRepository } from "../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import { hydrateChannelPollCursor } from "../../src/channels/types/ChannelPollCursor";
import { EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD } from "../../src/channels/providers/ical/map/icalEmptyCursorBaseline";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440010";
const OTHER_TENANT_ID = "550e8400-e29b-41d4-a716-446655440012";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440011";
const OTHER_CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440013";

describe("InMemoryChannelPollCursorRepository", () => {
  const connections = new InMemoryChannelConnectionRepository();
  const repository = new InMemoryChannelPollCursorRepository(connections);

  beforeEach(async () => {
    repository.clear();
    connections.clear();
    await connections.create(
      ChannelConnection.createDraft({
        tenantId: TENANT_ID,
        id: CONNECTION_ID,
        provider: "manual",
        displayName: "Cursor test",
      }),
    );
    await connections.create(
      ChannelConnection.createDraft({
        tenantId: OTHER_TENANT_ID,
        id: OTHER_CONNECTION_ID,
        provider: "manual",
        displayName: "Other tenant cursor test",
      }),
    );
  });

  it("returns null when no cursor exists", async () => {
    expect(await repository.getCursor(TENANT_ID, CONNECTION_ID)).toBeNull();
  });

  it("creates version 1 under the observed semantic epoch from expected version 0", async () => {
    const cursor = await repository.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: " opaque:\nΩpayload ",
    });

    expect(cursor).toMatchObject({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      payload: " opaque:\nΩpayload ",
      version: 1,
      semanticConfigVersion: 1,
    });
    expect(await repository.getCursor(TENANT_ID, CONNECTION_ID)).toMatchObject({
      payload: " opaque:\nΩpayload ",
      version: 1,
      semanticConfigVersion: 1,
    });
  });

  it("rejects create unless expected cursor version is 0", async () => {
    await expect(
      repository.advanceCursor({
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 1,
        nextPayload: "cursor",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("increments exactly once and rejects stale cursor versions", async () => {
    await repository.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "offset:0",
    });

    const updated = await repository.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 1,
      nextPayload: "offset:100",
    });
    expect(updated.version).toBe(2);

    await expect(
      repository.advanceCursor({
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 1,
        nextPayload: "stale",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await repository.getCursor(TENANT_ID, CONNECTION_ID))?.payload).toBe(
      "offset:100",
    );
  });

  it("rejects stale connection and cursor-row semantic epochs", async () => {
    await repository.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "epoch-1",
    });

    const connection = await connections.findById(TENANT_ID, CONNECTION_ID);
    connection!.applySemanticModeChange("availability_block_feed");
    await connections.persistSemanticState({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      expectedSemanticConfigVersion: 1,
      semanticMode: connection!.semanticMode,
      semanticConfigVersion: connection!.semanticConfigVersion,
      updatedAt: connection!.updatedAt,
    });

    await expect(
      repository.advanceCursor({
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 1,
        nextPayload: "stale-epoch",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("baseline-resets in place, stays tenant-scoped, and rejects absent connections", async () => {
    await repository.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "live",
    });
    await repository.advanceCursor({
      tenantId: OTHER_TENANT_ID,
      connectionId: OTHER_CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "other",
    });

    const baseline = {
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      semanticConfigVersion: 2,
      baselinePayload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
    };
    // The row is never deleted, so the durable version is retained and the
    // reset is idempotent.
    expect(await repository.resetPollCursorBaseline(baseline)).toEqual({
      cursorRowUpdated: true,
      retainedVersion: 1,
    });
    expect(await repository.resetPollCursorBaseline(baseline)).toEqual({
      cursorRowUpdated: true,
      retainedVersion: 1,
    });
    expect(await repository.getCursor(TENANT_ID, CONNECTION_ID)).toMatchObject({
      payload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
      version: 1,
      semanticConfigVersion: 2,
    });
    expect(
      await repository.getCursor(OTHER_TENANT_ID, OTHER_CONNECTION_ID),
    ).toMatchObject({ payload: "other", version: 1 });

    await expect(
      repository.resetPollCursorBaseline({
        ...baseline,
        tenantId: "550e8400-e29b-41d4-a716-446655440099",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("reports no row updated when there is no cursor to baseline-reset", async () => {
    expect(
      await repository.resetPollCursorBaseline({
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        semanticConfigVersion: 1,
        baselinePayload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
      }),
    ).toEqual({ cursorRowUpdated: false, retainedVersion: null });
  });

  it("advances past the highest reconciliation generation after a baseline reset", async () => {
    await repository.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
      nextPayload: "live",
    });
    repository.noteReconciliationCursorVersion(TENANT_ID, CONNECTION_ID, 7);
    await repository.resetPollCursorBaseline({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      semanticConfigVersion: 1,
      baselinePayload: EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
    });

    const advanced = await repository.advanceCursor({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 1,
      nextPayload: "post-baseline",
    });
    expect(advanced.version).toBe(8);
  });
});

describe("hydrateChannelPollCursor", () => {
  const valid = {
    tenantId: TENANT_ID,
    connectionId: CONNECTION_ID,
    payload: "",
    version: 1,
    semanticConfigVersion: 1,
    updatedAt: new Date("2026-07-17T00:00:00Z"),
  };

  it("hydrates valid persisted state without interpreting payload", () => {
    expect(hydrateChannelPollCursor(valid)).toEqual(valid);
  });

  it.each([
    { ...valid, version: 0 },
    { ...valid, version: 1.5 },
    { ...valid, semanticConfigVersion: 0 },
    { ...valid, semanticConfigVersion: Number.NaN },
  ])("rejects invalid persisted versions strictly", (persisted) => {
    expect(() => hydrateChannelPollCursor(persisted)).toThrow(ValidationError);
  });
});

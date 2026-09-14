import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConflictError } from "../../src/shared/errors/DomainError";
import { Result } from "../../src/shared/kernel/Result";
import { DEFAULT_SIMULATED_FIXTURE } from "../../src/channels/simulation/SimulatedReservationFixtures";
import { InMemoryChannelPollCursorRepository } from "../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import { createChannelIngressTestStack } from "./helpers/channelIngressTestStack";
import { buildTransportTestMessage } from "./fixtures/testChannelTransportFixtures";
describe("ExecuteChannelPollConnectionUseCase", () => {
  let stack: Awaited<ReturnType<typeof createChannelIngressTestStack>>;

  beforeEach(async () => {
    stack = await createChannelIngressTestStack();
    stack.cursorRepository.clear();
  });

  function seedInitialPoll(messages: ReturnType<typeof buildTransportTestMessage>[]) {
    stack.pollingProvider.seedCursorMessages(null, messages);
  }

  it("1. advances cursor on happy path poll → Receive → CAS success", async () => {
    seedInitialPoll([
      buildTransportTestMessage({
        messageId: "poll-happy-1",
        kind: "reservation.create",
        connectionId: stack.connectionId,
        externalReservationId: "ext-happy-1",
        payload: DEFAULT_SIMULATED_FIXTURE,
      }),
    ]);

    const result = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.cursorAdvanced).toBe(true);
    expect(result.cursorReconciliation).toBe("advanced");
    expect(result.shouldRetryJob).toBe(false);
    expect(result.proposedNextCursor).toBe("cursor-1");
    expect(result.committedCursorVersion).toBe(1);

    const cursor = await stack.cursorRepository.getCursor(stack.tenantId, stack.connectionId);
    expect(cursor).toMatchObject({
      payload: "cursor-1",
      version: 1,
      semanticConfigVersion: 1,
    });
  });

  it("2. completes without cursor advance when proposedNextCursor is null", async () => {
    stack.pollingProvider.seedCursorMessages(null, []);
    vi.spyOn(stack.pollingProvider, "poll").mockResolvedValueOnce({
      messages: [],
      nextCursor: null,
    });

    const result = await stack.pollConnectionUseCase.execute({      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.cursorAdvanced).toBe(false);
    expect(result.cursorReconciliation).toBe("not_applicable");
    expect(result.shouldRetryJob).toBe(false);
    expect(await stack.cursorRepository.getCursor(stack.tenantId, stack.connectionId)).toBeNull();
  });

  it("3. advances cursor when duplicate Receive is deduplicated", async () => {
    seedInitialPoll([
      buildTransportTestMessage({
        messageId: "poll-dedup-1",
        kind: "reservation.create",
        connectionId: stack.connectionId,
        externalReservationId: "ext-dedup-1",
        payload: DEFAULT_SIMULATED_FIXTURE,
      }),
    ]);

    const first = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });
    expect(first.cursorAdvanced).toBe(true);

    stack.pollingProvider.seedCursorMessages("cursor-1", [
      buildTransportTestMessage({
        messageId: "poll-dedup-1",
        kind: "reservation.create",
        connectionId: stack.connectionId,
        externalReservationId: "ext-dedup-1",
        payload: DEFAULT_SIMULATED_FIXTURE,
      }),
    ]);

    const second = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(second.ackAllowed).toBe(true);
    expect(second.results[0]?.deduplicated).toBe(true);
    expect(second.cursorAdvanced).toBe(true);
    expect(await stack.cursorRepository.getCursor(stack.tenantId, stack.connectionId)).toMatchObject({
      payload: "cursor-1-next",
      version: 2,
      semanticConfigVersion: 1,
    });
  });

  it("4. does not advance cursor on partial batch Receive failure", async () => {
    seedInitialPoll([
      buildTransportTestMessage({
        messageId: "poll-partial-1",
        kind: "reservation.create",
        connectionId: stack.connectionId,
        externalReservationId: "ext-partial-1",
        payload: DEFAULT_SIMULATED_FIXTURE,
      }),
      buildTransportTestMessage({
        messageId: "poll-partial-2",
        kind: "reservation.create",
        connectionId: stack.connectionId,
        externalReservationId: "ext-partial-2",
        payload: DEFAULT_SIMULATED_FIXTURE,
      }),
    ]);

    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");
    receiveSpy
      .mockResolvedValueOnce(Result.ok({ deduplicated: false, inboxItemId: "inbox-1" }))
      .mockResolvedValueOnce(Result.fail(new Error("Receive failed")));

    const result = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.cursorAdvanced).toBe(false);
    expect(result.shouldRetryJob).toBe(true);
    expect(result.retryClassification).toBe("provider_retry");
    expect(await stack.cursorRepository.getCursor(stack.tenantId, stack.connectionId)).toBeNull();
  });

  it("5. does not advance cursor on provenance failure", async () => {
    seedInitialPoll([
      buildTransportTestMessage({
        messageId: "poll-prov-1",
        kind: "reservation.create",
        connectionId: "other-connection",
        externalReservationId: "ext-prov-1",
        payload: {},
      }),
    ]);

    const result = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failurePhase).toBe("provenance");
    expect(result.cursorAdvanced).toBe(false);
    expect(result.shouldRetryJob).toBe(false);
  });

  it("6. does not advance cursor on inactive connection", async () => {
    const connection = await stack.connectionRepository.findById(
      stack.tenantId,
      stack.connectionId,
    );
    const priorStatus = connection!.status;
    const version = connection!.semanticConfigVersion;
    connection!.pause();
    await stack.connectionRepository.pauseWithExpectedSemanticVersion(
      connection!,
      version,
      priorStatus,
    );

    seedInitialPoll([]);

    const result = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("inactive_connection");
    expect(result.cursorAdvanced).toBe(false);
    expect(result.shouldRetryJob).toBe(false);
  });

  it("7. does not advance cursor when provider poll throws", async () => {
    vi.spyOn(stack.pollingProvider, "poll").mockRejectedValueOnce(new Error("Provider timeout"));

    const result = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failurePhase).toBe("poll");
    expect(result.cursorAdvanced).toBe(false);
    expect(result.shouldRetryJob).toBe(true);
    expect(result.retryClassification).toBe("provider_retry");
  });

  it("8. completes with already_committed when CAS fails but reloaded equals proposedNextCursor", async () => {
    const message = buildTransportTestMessage({
      messageId: "poll-cas-equiv-1",
      kind: "reservation.create",
      connectionId: stack.connectionId,
      externalReservationId: "ext-cas-equiv-1",
      payload: DEFAULT_SIMULATED_FIXTURE,
    });

    await stack.cursorRepository.advanceCursor({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      nextPayload: "P0",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
    });
    await stack.cursorRepository.advanceCursor({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      nextPayload: "P1",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 1,
    });

    stack.pollingProvider.seedCursorMessages("P0", [message]);
    vi.spyOn(stack.pollingProvider, "poll").mockResolvedValueOnce({
      messages: [message],
      nextCursor: "P1",
    });

    const underlyingGetCursor = InMemoryChannelPollCursorRepository.prototype.getCursor.bind(
      stack.cursorRepository,
    );
    let getCursorCalls = 0;
    vi.spyOn(stack.cursorRepository, "getCursor").mockImplementation(async (tenantId, connectionId) => {
      getCursorCalls += 1;
      if (getCursorCalls === 1) {
        return { payload: "P0", version: 1 };
      }
      return underlyingGetCursor(tenantId, connectionId);
    });
    vi.spyOn(stack.cursorRepository, "advanceCursor").mockRejectedValue(
      new ConflictError("stale cursor"),
    );

    const result = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.cursorAdvanced).toBe(false);
    expect(result.cursorReconciliation).toBe("already_committed");
    expect(result.shouldRetryJob).toBe(false);
    expect(result.proposedNextCursor).toBe("P1");
  });
  it("9. requests job retry on deferred_retry when CAS fails with different committed cursor", async () => {
    const message = buildTransportTestMessage({
      messageId: "poll-cas-retry-1",
      kind: "reservation.create",
      connectionId: stack.connectionId,
      externalReservationId: "ext-cas-retry-1",
      payload: DEFAULT_SIMULATED_FIXTURE,
    });

    await stack.cursorRepository.advanceCursor({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      nextPayload: "P0",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
    });
    await stack.cursorRepository.advanceCursor({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      nextPayload: "P1",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 1,
    });

    stack.pollingProvider.seedCursorMessages("P0", [message]);
    vi.spyOn(stack.pollingProvider, "poll").mockResolvedValueOnce({
      messages: [message],
      nextCursor: "P2",
    });

    const underlyingGetCursor = InMemoryChannelPollCursorRepository.prototype.getCursor.bind(
      stack.cursorRepository,
    );
    let getCursorCalls = 0;
    vi.spyOn(stack.cursorRepository, "getCursor").mockImplementation(async (tenantId, connectionId) => {
      getCursorCalls += 1;
      if (getCursorCalls === 1) {
        return { payload: "P0", version: 1 };
      }
      return underlyingGetCursor(tenantId, connectionId);
    });
    vi.spyOn(stack.cursorRepository, "advanceCursor").mockRejectedValue(
      new ConflictError("stale cursor"),
    );

    const result = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.cursorAdvanced).toBe(false);
    expect(result.cursorReconciliation).toBe("deferred_retry");
    expect(result.shouldRetryJob).toBe(true);
    expect(result.retryClassification).toBe("transient");
    expect(await stack.cursorRepository.getCursor(stack.tenantId, stack.connectionId)).toMatchObject({
      payload: "P1",
      version: 2,
      semanticConfigVersion: 1,
    });
  });
  it("10. returns invalid_connection without retry when connection is missing", async () => {
    const result = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: "missing-connection-id",
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("invalid_connection");
    expect(result.shouldRetryJob).toBe(false);
  });

  it("11. classifies credential resolution failure as transient retry", async () => {
    seedInitialPoll([]);
    vi.spyOn(stack.credentialResolver, "resolveCredential").mockRejectedValueOnce(
      new Error("Failed to resolve credential ref"),
    );

    const result = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("credential_resolution_failed");
    expect(result.shouldRetryJob).toBe(true);
    expect(result.retryClassification).toBe("transient");
  });

  it("12. re-polls from reloaded cursor after deferred retry without losing dedup safety", async () => {
    const message = buildTransportTestMessage({
      messageId: "poll-retry-seq-1",
      kind: "reservation.create",
      connectionId: stack.connectionId,
      externalReservationId: "ext-retry-seq-1",
      payload: DEFAULT_SIMULATED_FIXTURE,
    });

    await stack.cursorRepository.advanceCursor({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      nextPayload: "P0",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 0,
    });
    await stack.cursorRepository.advanceCursor({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      nextPayload: "P1",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 1,
    });

    stack.pollingProvider.seedCursorMessages("P0", [message]);
    stack.pollingProvider.seedCursorMessages("P1", [message]);

    const underlyingGetCursor = InMemoryChannelPollCursorRepository.prototype.getCursor.bind(
      stack.cursorRepository,
    );
    let getCursorCalls = 0;
    vi.spyOn(stack.cursorRepository, "getCursor").mockImplementation(async (tenantId, connectionId) => {
      getCursorCalls += 1;
      if (getCursorCalls === 1) {
        return { payload: "P0", version: 1 };
      }
      return underlyingGetCursor(tenantId, connectionId);
    });
    vi.spyOn(stack.pollingProvider, "poll").mockResolvedValueOnce({
      messages: [message],
      nextCursor: "P2",
    });
    vi.spyOn(stack.cursorRepository, "advanceCursor").mockRejectedValueOnce(
      new ConflictError("stale cursor"),
    );

    const deferred = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });
    expect(deferred.cursorReconciliation).toBe("deferred_retry");
    expect(deferred.shouldRetryJob).toBe(true);

    vi.restoreAllMocks();

    const retry = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(retry.ackAllowed).toBe(true);
    expect(retry.results[0]?.deduplicated).toBe(true);
    expect(retry.cursorAdvanced).toBe(true);
    expect(retry.cursorReconciliation).toBe("advanced");
  });});

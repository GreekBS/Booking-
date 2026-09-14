import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConflictError } from "../../src/shared/errors/DomainError";
import { POLL_CHANNEL_CONNECTION_JOB_TYPE } from "../../src/platform/async/jobs/types/JobTypes";
import type { BackgroundJobEntry } from "../../src/shared/types/index";
import { DEFAULT_SIMULATED_FIXTURE } from "../../src/channels/simulation/SimulatedReservationFixtures";
import { InMemoryChannelPollCursorRepository } from "../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import { createChannelIngressTestStack } from "./helpers/channelIngressTestStack";
import { buildTransportTestMessage } from "./fixtures/testChannelTransportFixtures";

describe("PollChannelConnectionJobHandler", () => {
  let stack: Awaited<ReturnType<typeof createChannelIngressTestStack>>;

  beforeEach(async () => {
    stack = await createChannelIngressTestStack();
    stack.cursorRepository.clear();
  });

  function buildJob(payload: Record<string, unknown>, tenantId?: string | null): BackgroundJobEntry {
    return {
      id: "job-poll-1",
      tenantId: tenantId ?? stack.tenantId,
      jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
      payload,
      status: "pending",
      priority: 0,
      runAt: new Date(),
      idempotencyKey: null,
      attemptCount: 0,
      maxAttempts: 5,
    createdAt: new Date(),
    };
  }

  it("handles poll_channel_connection job type", () => {
    expect(stack.pollConnectionJobHandler.canHandle(POLL_CHANNEL_CONNECTION_JOB_TYPE)).toBe(true);
    expect(stack.pollConnectionJobHandler.canHandle("other_job")).toBe(false);
  });

  it("completes successfully on happy path poll", async () => {
    stack.pollingProvider.seedCursorMessages(null, [
      buildTransportTestMessage({
        messageId: "job-poll-happy-1",
        kind: "reservation.create",
        connectionId: stack.connectionId,
        externalReservationId: "ext-job-happy-1",
        payload: DEFAULT_SIMULATED_FIXTURE,
      }),
    ]);

    await expect(
      stack.pollConnectionJobHandler.run(
        buildJob({ connectionId: stack.connectionId }),
      ),
    ).resolves.toBeUndefined();

    const cursor = await stack.cursorRepository.getCursor(stack.tenantId, stack.connectionId);
    expect(cursor?.payload).toBe("cursor-1");
  });

  it("throws when tenantId is missing", async () => {
    const job: BackgroundJobEntry = {
      id: "job-poll-missing-tenant",
      tenantId: null,
      jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
      payload: { connectionId: stack.connectionId },
      status: "pending",
      priority: 0,
      runAt: new Date(),
      idempotencyKey: null,
      attemptCount: 0,
      maxAttempts: 5,
    createdAt: new Date(),
    };

    await expect(stack.pollConnectionJobHandler.run(job)).rejects.toThrow(/missing tenantId/);
  });

  it("throws when connectionId payload is invalid", async () => {
    await expect(stack.pollConnectionJobHandler.run(buildJob({}))).rejects.toThrow(
      /connectionId is required/,
    );
  });

  it("throws on transient retry classification (deferred_retry)", async () => {
    const message = buildTransportTestMessage({
      messageId: "job-poll-retry-1",
      kind: "reservation.create",
      connectionId: stack.connectionId,
      externalReservationId: "ext-job-retry-1",
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

    await expect(
      stack.pollConnectionJobHandler.run(
        buildJob({ connectionId: stack.connectionId }),
      ),
    ).rejects.toThrow();
  });

  it("completes on permanent failure without retry", async () => {
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

    await expect(
      stack.pollConnectionJobHandler.run(
        buildJob({ connectionId: stack.connectionId }),
      ),
    ).resolves.toBeUndefined();
  });

  it("completes on already_committed CAS reconciliation", async () => {
    const message = buildTransportTestMessage({
      messageId: "job-poll-equiv-1",
      kind: "reservation.create",
      connectionId: stack.connectionId,
      externalReservationId: "ext-job-equiv-1",
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

    await expect(
      stack.pollConnectionJobHandler.run(
        buildJob({ connectionId: stack.connectionId }),
      ),
    ).resolves.toBeUndefined();
  });
});

import { describe, expect, it, vi } from "vitest";
import { ConflictError } from "../../../../../src/shared/errors/DomainError";
import { InMemoryChannelPollCursorRepository } from "../../../../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import type { ProviderContractFixture } from "../../../../../src/channels/contract/ProviderContractFixtureTypes";
import {
  assertDeclaredSourceEventsReachInbox,
  assertPollingCursorCompatibility,
} from "../assertions/invariantAssertions";

export function runPollingContractSuite(fixture: ProviderContractFixture): void {
  if (!fixture.eligibility.pollingCapable) {
    return;
  }
  if (!("polling" in fixture) || fixture.polling == null) {
    describe("polling provider contract", () => {
      it("requires polling fixture section when pollingCapable", () => {
        expect.fail("pollingCapable eligibility requires a polling fixture section");
      });
    });
    return;
  }

  const polling = fixture.polling;

  describe("polling provider contract", () => {
    it("rejects destructive cursor semantics as non-conformant", () => {
      assertPollingCursorCompatibility(fixture.eligibility);
    });

    it("advances cursor on CAS success", async () => {
      const stack = await fixture.createStack();
      polling.seedInitialPoll(stack);
      const result = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(result.ackAllowed).toBe(true);
      expect(result.cursorReconciliation).toBe("advanced");
    });

    it("tolerates repeated polling from the same committed cursor", async () => {
      assertPollingCursorCompatibility(fixture.eligibility);
      const stack = await fixture.createStack();
      const message = fixture.expectations.expectedReservationMessages.create;
      polling.seedDuplicatePoll(stack);
      const first = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      const cursor = await (
        stack.cursorRepository as InMemoryChannelPollCursorRepository
      ).getCursor(stack.tenantId, stack.connectionId);
      stack.pollingProvider?.seedCursorMessages(cursor?.payload ?? "cursor-1", [message]);
      const second = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(first.ackAllowed).toBe(true);
      expect(second.ackAllowed).toBe(true);
      expect(second.results[0]?.deduplicated).toBe(true);
    });

    it("does not advance cursor when ackAllowed is false", async () => {
      const stack = await fixture.createStack();
      polling.seedPartialBatchPoll?.(stack);
      const result = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(result.ackAllowed).toBe(false);
      expect(result.cursorAdvanced).toBe(false);
    });

    it("completes on CAS already_committed reconciliation", async () => {
      const stack = await fixture.createStack();
      const message = fixture.expectations.expectedReservationMessages.create;
      const proposed = polling.expectedProposedCursor ?? "cursor-1";
      const cursorRepo = stack.cursorRepository as InMemoryChannelPollCursorRepository;

      await cursorRepo.advanceCursor({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        nextPayload: "P0",
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 0,
      });
      await cursorRepo.advanceCursor({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        nextPayload: proposed,
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 1,
      });

      stack.pollingProvider?.seedCursorMessages("P0", [message]);
      vi.spyOn(stack.pollingProvider!, "poll").mockResolvedValueOnce({
        messages: [message],
        nextCursor: proposed,
      });

      const underlyingGetCursor = InMemoryChannelPollCursorRepository.prototype.getCursor.bind(
        cursorRepo,
      );
      let getCursorCalls = 0;
      vi.spyOn(cursorRepo, "getCursor").mockImplementation(async (tenantId, connectionId) => {
        getCursorCalls += 1;
        if (getCursorCalls === 1) {
          return { payload: "P0", version: 1 };
        }
        return underlyingGetCursor(tenantId, connectionId);
      });
      vi.spyOn(cursorRepo, "advanceCursor").mockRejectedValue(
        new ConflictError("stale cursor"),
      );

      const result = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(result.cursorReconciliation).toBe("already_committed");
      expect(result.shouldRetryJob).toBe(false);
    });

    it("requests deferred retry when CAS reconciliation diverges", async () => {
      if (!polling.seedConcurrentPollScenario) {
        return;
      }
      const stack = await fixture.createStack();
      polling.seedConcurrentPollScenario(stack);
      const cursorRepo = stack.cursorRepository as InMemoryChannelPollCursorRepository;
      await cursorRepo.advanceCursor({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        nextPayload: "P0",
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 0,
      });
      await cursorRepo.advanceCursor({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        nextPayload: "P1",
        observedSemanticConfigVersion: 1,
        expectedCursorVersion: 1,
      });
      const underlyingGetCursor = InMemoryChannelPollCursorRepository.prototype.getCursor.bind(
        cursorRepo,
      );
      let calls = 0;
      vi.spyOn(cursorRepo, "getCursor").mockImplementation(async (tenantId, connectionId) => {
        calls += 1;
        if (calls === 1) {
          return { payload: "P0", version: 1 };
        }
        return underlyingGetCursor(tenantId, connectionId);
      });
      vi.spyOn(cursorRepo, "advanceCursor").mockRejectedValue(
        new ConflictError("stale cursor"),
      );
      const result = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(result.cursorReconciliation).toBe("deferred_retry");
      expect(result.shouldRetryJob).toBe(true);
    });

    it("allows empty poll when no reservation source events are declared", async () => {
      const declared = (fixture.expectations.expectedSourceEvents ?? []).filter(
        (event) => event.reservationRelated,
      );
      if (declared.length > 0) {
        return;
      }
      const stack = await fixture.createStack();
      polling.seedEmptyPoll(stack);
      const result = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(result.ackAllowed).toBe(true);
      assertDeclaredSourceEventsReachInbox(stack, fixture.expectations.expectedSourceEvents);
    });
  });
}

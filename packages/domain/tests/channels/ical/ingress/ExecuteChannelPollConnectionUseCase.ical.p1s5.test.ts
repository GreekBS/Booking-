import { describe, expect, it, vi } from "vitest";
import { ConflictError } from "../../../../src/shared/errors/DomainError";
import { Result } from "../../../../src/shared/kernel/Result";
import { createIcalIngressTestStack } from "../../helpers/icalIngressTestStack";
import { encodeIcsCalendar } from "../helpers/encodeIcsCalendar";
import { dateValue, makeCalendar, makeEvent } from "../map/helpers";
import { mapIcalCalendar } from "../../../../src/channels";
import { buildIcalInboundIngressItems } from "../../../../src/channels/providers/ical/ingress/buildIcalInboundIngressItems";

describe("ExecuteChannelPollConnectionUseCase iCal P1-S5", () => {
  it("advances cursor on full ACK after iCal Receive", async () => {
    const stack = await createIcalIngressTestStack();
    const result = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.cursorAdvanced).toBe(true);
    expect(result.cursorReconciliation).toBe("advanced");
    expect(await stack.cursorRepository.getCursor(stack.tenantId, stack.connectionId)).toMatchObject({
      version: 1,
    });
  });

  it("does not advance cursor when Receive fails", async () => {
    const stack = await createIcalIngressTestStack();
    vi.spyOn(stack.receiveChannelEventUseCase, "execute").mockResolvedValueOnce(
      Result.fail(new Error("receive failed")),
    );

    const result = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.cursorAdvanced).toBe(false);
    expect(await stack.cursorRepository.getCursor(stack.tenantId, stack.connectionId)).toBeNull();
  });

  it("treats duplicate Receive as ACK success and advances cursor", async () => {
    const stack = await createIcalIngressTestStack();
    const first = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });
    expect(first.cursorAdvanced).toBe(true);

    const second = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });
    expect(second.ackAllowed).toBe(true);
    if (second.results.length > 0) {
      expect(second.results.every((entry) => entry.deduplicated === true || entry.success)).toBe(true);
    }
  });

  it("requests deferred_retry on CAS conflict with different committed cursor", async () => {
    const stack = await createIcalIngressTestStack();
    const first = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });
    const committedCursor = first.proposedNextCursor!;

    await stack.cursorRepository.advanceCursor({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      nextPayload: "foreign-cursor",
      observedSemanticConfigVersion: 1,
      expectedCursorVersion: 1,
    });

    vi.spyOn(stack.cursorRepository, "advanceCursor").mockRejectedValueOnce(
      new ConflictError("stale cursor"),
    );

    const retry = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });

    expect(retry.cursorReconciliation).toBe("deferred_retry");
    expect(retry.shouldRetryJob).toBe(true);
    expect(committedCursor).not.toBe("foreign-cursor");
  });

  it("concurrent same feed may race inserts but sequential retry dedupes", async () => {
    const stack = await createIcalIngressTestStack();
    const first = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });
    expect(first.ackAllowed).toBe(true);

    const second = await stack.pollConnectionUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });
    expect(second.ackAllowed).toBe(true);
    const inboxItems = stack.inboxRepository
      .listAllForTest()
      .filter((item) => item.connectionId === stack.connectionId);
    expect(inboxItems).toHaveLength(1);
    if (second.results.length > 0) {
      expect(second.results[0]?.deduplicated).toBe(true);
    }
  });

  it("preserves identical twin multiplicity through full poll orchestration", async () => {
    const twin = (index: number) =>
      makeEvent({
        eventIndex: index,
        componentIndex: index,
        uid: null,
        dtstart: dateValue("20260301"),
        dtend: dateValue("20260302"),
      });
    const batch = mapIcalCalendar({
      calendar: makeCalendar([twin(0), twin(1)]),
      previousCursorPayload: null,
    });
    const items = buildIcalInboundIngressItems(batch.records, "conn");
    expect(items).toHaveLength(2);

    const stack = await createIcalIngressTestStack({
      feedBody: encodeIcsCalendar([]),
    });
    for (const item of items) {
      await stack.receiveChannelEventUseCase.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        ingressKind: "poll",
        message: { ...item.message, connectionId: stack.connectionId },
        deduplicationKey: item.deduplicationKey,
      });
    }
    const inboxItems = stack.inboxRepository
      .listAllForTest()
      .filter((item) => item.connectionId === stack.connectionId);
    expect(inboxItems).toHaveLength(2);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { IChannelPollDiagnosticsReporter } from "../../../../src/channels/ports/IChannelPollDiagnosticsReporter";
import { createIcalIngressTestStack } from "../../helpers/icalIngressTestStack";
import { encodeIcsCalendar } from "../helpers/encodeIcsCalendar";

describe("ReceiveChannelPollBatchUseCase iCal P1-S5", () => {
  it("returns ackAllowed true and proposedNextCursor for trusted iCal poll", async () => {
    const stack = await createIcalIngressTestStack();
    const result = await stack.pollBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: "ical",
      cursorPayload: null,
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.proposedNextCursor).not.toBeNull();
    expect(result.proposedNextCursor!.trim().length).toBeGreaterThan(0);
    expect(await stack.cursorRepository.getCursor(stack.tenantId, stack.connectionId)).toBeNull();
  });

  it("reports cursor map issues via orchestration diagnostics reporter", async () => {
    const reportSpy = vi.fn();
    const diagnosticsReporter: IChannelPollDiagnosticsReporter = {
      reportIcalMapIssues: reportSpy,
    };
    const stack = await createIcalIngressTestStack({
      feedBody: encodeIcsCalendar([]),
      diagnosticsReporter,
    });

    await stack.pollBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: "ical",
      cursorPayload: "{bad",
    });

    expect(reportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        provider: "ical",
        issueCodes: expect.arrayContaining(["CURSOR_INVALID"]),
      }),
    );
    const payload = reportSpy.mock.calls[0]?.[0];
    expect(payload).not.toHaveProperty("cursorPayload");
    expect(payload).not.toHaveProperty("feedUrl");
  });

  it("allows zero-message ACK for unchanged feed", async () => {
    const stack = await createIcalIngressTestStack();
    const first = await stack.pollBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: "ical",
      cursorPayload: null,
    });
    const second = await stack.pollBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: "ical",
      cursorPayload: first.proposedNextCursor,
    });
    expect(second.ackAllowed).toBe(true);
    expect(second.results).toHaveLength(0);
    expect(second.proposedNextCursor).not.toBeNull();
  });
});

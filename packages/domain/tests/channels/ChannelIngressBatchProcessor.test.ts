import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChannelIngressBatchProcessor } from "../../src/channels/application/ChannelIngressBatchProcessor";
import type { ReceiveChannelEventUseCase } from "../../src/channels/application/ReceiveChannelEventUseCase";
import { Result } from "../../src/shared/kernel/Result";
import { buildTransportTestMessage } from "./fixtures/testChannelTransportFixtures";
import { TEST_CHANNEL_TRANSPORT_PROVIDER_ID } from "../../src/channels/simulation/TestChannelTransportProviderBundle";

describe("ChannelIngressBatchProcessor", () => {
  let receiveUseCase: ReceiveChannelEventUseCase;
  let processor: ChannelIngressBatchProcessor;

  beforeEach(() => {
    receiveUseCase = {
      execute: vi.fn(),
    } as unknown as ReceiveChannelEventUseCase;
    processor = new ChannelIngressBatchProcessor(receiveUseCase);
  });

  it("returns ackAllowed true when all Receive calls succeed", async () => {
    vi.mocked(receiveUseCase.execute).mockResolvedValue(
      Result.ok({ inboxItemId: "inbox-1", deduplicated: false, jobId: "job-1" }),
    );

    const result = await processor.processBatch({
      tenantId: "tenant-1",
      connectionId: "conn-1",
      ingressKind: "webhook",
      items: [
        buildTransportTestMessage({
          messageId: "msg-1",
          kind: "reservation.create",
          externalReservationId: "ext-1",
        }),
        buildTransportTestMessage({
          messageId: "msg-2",
          kind: "reservation.modify",
          externalReservationId: "ext-2",
        }),
      ],
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(receiveUseCase.execute).toHaveBeenCalledTimes(2);
  });

  it("returns ackAllowed false when one Receive fails", async () => {
    vi.mocked(receiveUseCase.execute)
      .mockResolvedValueOnce(
        Result.ok({ inboxItemId: "inbox-1", deduplicated: false, jobId: "job-1" }),
      )
      .mockResolvedValueOnce(Result.fail(new Error("receive failed")));

    const result = await processor.processBatch({
      tenantId: "tenant-1",
      connectionId: "conn-1",
      ingressKind: "webhook",
      items: [
        buildTransportTestMessage({
          messageId: "msg-1",
          kind: "reservation.create",
          externalReservationId: "ext-1",
        }),
        buildTransportTestMessage({
          messageId: "msg-2",
          kind: "reservation.create",
          externalReservationId: "ext-2",
        }),
      ],
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.results[0]?.success).toBe(true);
    expect(result.results[1]?.success).toBe(false);
    expect(receiveUseCase.execute).toHaveBeenCalledTimes(2);
  });

  it("treats deduplicated Receive as success", async () => {
    vi.mocked(receiveUseCase.execute).mockResolvedValue(
      Result.ok({ inboxItemId: "inbox-1", deduplicated: true, jobId: "job-1" }),
    );

    const result = await processor.processBatch({
      tenantId: "tenant-1",
      connectionId: "conn-1",
      ingressKind: "poll",
      items: [
        buildTransportTestMessage({
          messageId: "msg-1",
          kind: "reservation.create",
          externalReservationId: "ext-1",
        }),
      ],
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.results[0]?.deduplicated).toBe(true);
  });

  it("returns ackAllowed true for an empty message batch", async () => {
    const result = await processor.processBatch({
      tenantId: "tenant-1",
      connectionId: "conn-1",
      ingressKind: "webhook",
      items: [],
    });

    expect(result.ackAllowed).toBe(true);
    expect(receiveUseCase.execute).not.toHaveBeenCalled();
  });

  it("forwards trusted deduplicationKey to Receive for trusted envelope items", async () => {
    const trustedKey = {
      value: "ingress:ical:v1:" + "a".repeat(64),
    };
    vi.mocked(receiveUseCase.execute).mockResolvedValue(
      Result.ok({ inboxItemId: "inbox-1", deduplicated: false, jobId: "job-1" }),
    );

    await processor.processBatch({
      tenantId: "tenant-1",
      connectionId: "conn-1",
      ingressKind: "poll",
      items: [
        {
          message: buildTransportTestMessage({
            messageId: "ical-msg-v1-" + "b".repeat(64),
            kind: "reservation.unknown",
            connectionId: "conn-1",
            provider: "ical",
            payload: { providerEventId: "evt-1" },
          }),
          deduplicationKey: trustedKey as never,
        },
      ],
    });

    expect(receiveUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ deduplicationKey: trustedKey }),
    );
  });
});

describe("ChannelIngressBatchProcessor reservation kinds", () => {
  it("submits modify and cancel messages to Receive", async () => {
    const receiveUseCase = {
      execute: vi.fn().mockResolvedValue(
        Result.ok({ inboxItemId: "inbox-1", deduplicated: false, jobId: "job-1" }),
      ),
    } as unknown as ReceiveChannelEventUseCase;
    const processor = new ChannelIngressBatchProcessor(receiveUseCase);

    await processor.processBatch({
      tenantId: "tenant-1",
      connectionId: "conn-1",
      ingressKind: "webhook",
      items: [
        buildTransportTestMessage({
          messageId: "msg-modify",
          kind: "reservation.modify",
          externalReservationId: "ext-modify",
          provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
        }),
        buildTransportTestMessage({
          messageId: "msg-cancel",
          kind: "reservation.cancel",
          externalReservationId: "ext-cancel",
          provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
        }),
      ],
    });

    expect(receiveUseCase.execute).toHaveBeenCalledTimes(2);
  });
});

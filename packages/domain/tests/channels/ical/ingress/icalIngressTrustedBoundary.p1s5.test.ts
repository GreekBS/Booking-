import { describe, expect, it, vi } from "vitest";
import { ChannelInboxDeduplicationKey } from "../../../../src/channels/domain/value-objects/ChannelInboxDeduplicationKey";
import { ChannelIngressBatchProcessor } from "../../../../src/channels/application/ChannelIngressBatchProcessor";
import { Result } from "../../../../src/shared/kernel/Result";
import { buildTransportTestMessage } from "../../fixtures/testChannelTransportFixtures";
import { encodeChannelWebhookBody } from "../../../../src/channels/types/ChannelWebhookTransportRequest";
import { TEST_CHANNEL_TRANSPORT_PROVIDER_ID } from "../../../../src/channels/simulation/TestChannelTransportProviderBundle";
import { buildTestWebhookSignature, TEST_WEBHOOK_SIGNATURE_HEADER } from "../../../../src/channels/simulation/TestChannelWebhookProvider";
import { createChannelIngressTestStack } from "../../helpers/channelIngressTestStack";
import { createIcalIngressTestStack } from "../../helpers/icalIngressTestStack";
import { encodeIcsCalendar } from "../helpers/encodeIcsCalendar";
import { buildIcalInboundIngressItems } from "../../../../src/channels/providers/ical/ingress/buildIcalInboundIngressItems";
import { mapIcalCalendar } from "../../../../src/channels";
import { dateValue, makeCalendar, makeEvent } from "../map/helpers";

describe("iCal ingress trusted dedup boundary P1-S5", () => {
  it("passes explicit deduplicationKey to Receive for trusted envelope items", async () => {
    const receiveSpy = vi.fn().mockResolvedValue(
      Result.ok({ inboxItemId: "inbox-1", deduplicated: false, jobId: "job-1" }),
    );
    const processor = new ChannelIngressBatchProcessor({
      execute: receiveSpy,
    } as never);

    const trustedKey = ChannelInboxDeduplicationKey.forIcalIngressDigestV1("d".repeat(64));
    const message = buildTransportTestMessage({
      messageId: "ical-msg-v1-" + "e".repeat(64),
      kind: "reservation.unknown",
      connectionId: "conn-1",
      provider: "ical",
      payload: { providerEventId: "should-not-control-dedup" },
    });

    await processor.processBatch({
      tenantId: "tenant-1",
      connectionId: "conn-1",
      ingressKind: "poll",
      items: [{ message, deduplicationKey: trustedKey }],
    });

    expect(receiveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        deduplicationKey: trustedKey,
      }),
    );
    expect(receiveSpy.mock.calls[0]?.[0]?.deduplicationKey?.value).toBe(trustedKey.value);
    expect(receiveSpy.mock.calls[0]?.[0]?.deduplicationKey?.value).not.toContain("providerEventId");
  });

  it("does not let provider payload choose iCal dedup identity during poll Receive", async () => {
    const stack = await createIcalIngressTestStack();
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    await stack.pollBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: "ical",
      cursorPayload: null,
    });

    expect(receiveSpy).toHaveBeenCalled();
    const call = receiveSpy.mock.calls[0]?.[0];
    expect(call?.deduplicationKey?.value).toMatch(/^ingress:ical:v1:[0-9a-f]{64}$/);
    expect(call?.deduplicationKey?.value.length).toBe(80);
    expect(call?.deduplicationKey?.value).not.toContain(call?.message.payload.providerEventId as string);
  });

  it("webhook path cannot inject trusted iCal dedup envelope", async () => {
    const stack = await createChannelIngressTestStack();
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const message = buildTransportTestMessage({
      messageId: "webhook-unknown",
      kind: "reservation.unknown",
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      payload: {
        providerEventId: "evt-webhook",
        ingressDedupKey: "ingress:ical:v1:" + "f".repeat(64),
      },
    });
    const rawBody = JSON.stringify([message]);
    const rawBodyBytes = encodeChannelWebhookBody(rawBody);

    await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: {
        headers: {
          [TEST_WEBHOOK_SIGNATURE_HEADER]: buildTestWebhookSignature(
            "test-webhook-secret",
            rawBody,
          ),
        },
        rawBody,
        rawBodyBytes,
      },
    });

    expect(receiveSpy).toHaveBeenCalled();
    expect(receiveSpy.mock.calls[0]?.[0]?.deduplicationKey).toBeUndefined();
    const stored = stack.inboxRepository
      .listAllForTest()
      .find((item) => item.connectionId === stack.connectionId);
    expect(stored?.deduplicationKey).toMatch(/^ingress:unknown:/);
    expect(stored?.deduplicationKey).not.toMatch(/^ingress:ical:v1:/);
  });

  it("non-iCal poll messages still use forIngressMessage dedup semantics", async () => {
    const stack = await createChannelIngressTestStack();
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    stack.pollingProvider.seedCursorMessages(null, [
      buildTransportTestMessage({
        messageId: "poll-create-1",
        kind: "reservation.create",
        connectionId: stack.connectionId,
        externalReservationId: "ext-1",
        payload: {},
      }),
    ]);

    await stack.pollBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      cursorPayload: null,
    });

    expect(receiveSpy.mock.calls[0]?.[0]?.deduplicationKey).toBeUndefined();
    const stored = stack.inboxRepository
      .listAllForTest()
      .find((item) => item.connectionId === stack.connectionId);
    expect(stored?.deduplicationKey).toBe(`ingress:create:${stack.connectionId}:ext-1`);
  });

  it("trusted iCal dedup differs from forIngressMessage unknown dedup for same providerEventId", () => {
    const batch = mapIcalCalendar({
      calendar: makeCalendar([makeEvent({ eventIndex: 0, uid: "dup@x" })]),
      previousCursorPayload: null,
    });
    const items = buildIcalInboundIngressItems(batch.records, "conn-1");
    const trusted = items[0]!.deduplicationKey.value;
    const payloadDerived = ChannelInboxDeduplicationKey.forIngressMessage(
      "conn-1",
      items[0]!.message,
    ).value;
    expect(trusted).toMatch(/^ingress:ical:v1:/);
    expect(payloadDerived).toMatch(/^ingress:unknown:/);
    expect(trusted).not.toBe(payloadDerived);
  });

  it("identical iCal twins produce two durable inbox rows on Receive", async () => {
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
    const items = buildIcalInboundIngressItems(batch.records, "conn-1");
    const stack = await createIcalIngressTestStack({
      feedBody: encodeIcsCalendar([]),
    });

    for (const item of items) {
      const result = await stack.receiveChannelEventUseCase.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        ingressKind: "poll",
        message: { ...item.message, connectionId: stack.connectionId },
        deduplicationKey: item.deduplicationKey,
      });
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().deduplicated).toBe(false);
    }

    const all = stack.inboxRepository
      .listAllForTest()
      .filter((item) => item.tenantId === stack.tenantId && item.connectionId === stack.connectionId);
    expect(all).toHaveLength(2);
  });
});

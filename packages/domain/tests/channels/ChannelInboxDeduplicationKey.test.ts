import { describe, it, expect } from "vitest";
import { ChannelInboxDeduplicationKey } from "../../src/channels/domain/value-objects/ChannelInboxDeduplicationKey";
import { buildTransportTestMessage } from "./fixtures/testChannelTransportFixtures";

describe("ChannelInboxDeduplicationKey", () => {
  it("builds create deduplication keys", () => {
    const key = ChannelInboxDeduplicationKey.forCreate("conn-1", "res-1");
    expect(key.value).toBe("ingress:create:conn-1:res-1");
  });

  it("builds replay deduplication keys", () => {
    const key = ChannelInboxDeduplicationKey.forReplay("inbox-1", 2);
    expect(key.value).toBe("ingress:replay:inbox-1:2");
  });
});

describe("ChannelInboxDeduplicationKey CM-4a-2 reservation ingress", () => {
  const connectionId = "550e8400-e29b-41d4-a716-446655440401";

  it("builds modify and cancel keys", () => {
    expect(
      ChannelInboxDeduplicationKey.forModify(connectionId, "ext-1", "rev-1").value,
    ).toBe(`ingress:modify:${connectionId}:ext-1:rev-1`);
    expect(
      ChannelInboxDeduplicationKey.forCancel(connectionId, "ext-2", "msg-2").value,
    ).toBe(`ingress:cancel:${connectionId}:ext-2:msg-2`);
  });

  it("builds unknown keys without externalReservationId", () => {
    expect(ChannelInboxDeduplicationKey.forUnknown(connectionId, "msg-unknown").value).toBe(
      `ingress:unknown:${connectionId}:msg-unknown`,
    );
  });

  it("builds maintenance keys for connectivity.test", () => {
    expect(
      ChannelInboxDeduplicationKey.forMaintenanceEvent(
        connectionId,
        "connectivity.test",
        "evt-maintenance",
      ).value,
    ).toBe(`ingress:maintenance:${connectionId}:connectivity.test:evt-maintenance`);
  });

  it("derives reservation and maintenance keys from ingress messages", () => {
    const unknownMessage = buildTransportTestMessage({
      messageId: "msg-unknown",
      kind: "reservation.unknown",
      connectionId,
      payload: {},
    });

    expect(
      ChannelInboxDeduplicationKey.forIngressMessage(connectionId, unknownMessage).value,
    ).toBe(`ingress:unknown:${connectionId}:msg-unknown`);

    const maintenanceMessage = buildTransportTestMessage({
      messageId: "msg-maint",
      kind: "connectivity.test",
      connectionId,
      payload: { providerEventId: "maint-1" },
    });

    expect(
      ChannelInboxDeduplicationKey.forIngressMessage(connectionId, maintenanceMessage).value,
    ).toBe(`ingress:maintenance:${connectionId}:connectivity.test:maint-1`);
  });
});

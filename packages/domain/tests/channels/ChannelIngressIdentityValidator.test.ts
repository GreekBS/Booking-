import { describe, expect, it } from "vitest";
import {
  ALLOWED_INGRESS_MESSAGE_KINDS,
  validateKnownIngressMessageKinds,
} from "../../src/channels/application/ChannelIngressIdentityValidator";
import { buildTransportTestMessage } from "./fixtures/testChannelTransportFixtures";

describe("ChannelIngressIdentityValidator", () => {
  it("exports the closed normalized ingress kind allow-list", () => {
    expect(ALLOWED_INGRESS_MESSAGE_KINDS).toEqual([
      "reservation.create",
      "reservation.modify",
      "reservation.cancel",
      "reservation.unknown",
      "connectivity.test",
    ]);
  });

  it("rejects undeclared normalized reservation kinds before Receive", () => {
    const message = buildTransportTestMessage({
      messageId: "invalid-kind",
      kind: "reservation.reinstated" as "reservation.create",
      externalReservationId: "ext-invalid",
      payload: {},
    });

    const result = validateKnownIngressMessageKinds([message]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toContain("Unsupported ingress message kind");
    }
  });

  it("accepts reservation.unknown in the closed allow-list", () => {
    const message = buildTransportTestMessage({
      messageId: "unknown-1",
      kind: "reservation.unknown",
      externalReservationId: "ext-unknown",
      payload: { providerEventId: "evt-1", providerEventType: "reservation.reinstated" },
    });

    expect(validateKnownIngressMessageKinds([message])).toEqual({ ok: true });
  });
});

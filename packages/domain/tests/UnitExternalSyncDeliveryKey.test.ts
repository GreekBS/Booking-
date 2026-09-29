import { describe, expect, it } from "vitest";
import {
  buildUnitExternalSyncDeliveryKey,
  UNIT_EXTERNAL_SYNC_REQUIRED_EVENT_TYPE,
} from "../src/channels/types/ChannelUnitSyncChange";
import { UnitExternalSyncRequiredEvent } from "../src/channels/application/UnitExternalSyncRequiredEvent";

describe("UnitExternalSync delivery key", () => {
  it("fits outbox delivery_key CHAR(64) for rate-plan style sourceEventId", () => {
    const tenantId = "2984dd96-9451-4eed-a623-e8a461e67f42";
    const unitId = "60dadcda-c031-440f-9b34-8318d14c9a9f";
    const sourceEventId = `rate-plan:${unitId}:${Date.now()}`;
    const key = buildUnitExternalSyncDeliveryKey({
      tenantId,
      unitId,
      sourceEventId,
    });
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("event carries hashed deliveryKey", () => {
    const tenantId = "2984dd96-9451-4eed-a623-e8a461e67f42";
    const unitId = "60dadcda-c031-440f-9b34-8318d14c9a9f";
    const propertyId = "d8f2b50b-b252-40f2-b2a0-c389f332e2bf";
    const event = new UnitExternalSyncRequiredEvent({
      tenantId,
      unitId,
      propertyId,
      from: "2026-10-01",
      to: "2027-10-01",
      changeKinds: ["rates"],
      mutationOrigin: null,
      revision: Date.now(),
      sourceEventId: `rate-plan:${unitId}:${Date.now()}`,
    });
    expect(event.eventType).toBe(UNIT_EXTERNAL_SYNC_REQUIRED_EVENT_TYPE);
    expect(event.deliveryKey).toHaveLength(64);
  });
});

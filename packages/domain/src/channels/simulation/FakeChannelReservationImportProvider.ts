import type { ChannelReservationImportContext } from "../ports/providers/IChannelReservationImportProvider";
import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { ChannelReservationImportMapping } from "../types/ChannelReservationImportMapping";
import type { ChannelSource } from "../types/ChannelSource";
import {
  assertProviderSidePayload,
  type SimulatedExternalReservationPayload,
} from "./SimulatedReservationFixtures";

export class FakeChannelReservationImportProvider {
  async mapMessage(
    message: ChannelProviderMessage,
    context: ChannelReservationImportContext,
  ): Promise<ChannelReservationImportMapping> {
    assertProviderSidePayload(message.payload);
    const payload = message.payload as unknown as SimulatedExternalReservationPayload;
    const externalId = message.externalReservationId;
    if (!externalId) {
      return { kind: "unrecognized", reason: "Missing external reservation id" };
    }

    return {
      kind: "create",
      command: {
        tenantId: context.tenantId,
        propertyId: context.propertyId,
        unitId: context.unitId,
        checkIn: payload.checkIn,
        checkOut: payload.checkOut,
        guestCount: payload.guestCount,
        guest: payload.guest,
        source: message.provider,
        externalReference: {
          source: message.provider,
          externalId,
        },
      },
    };
  }
}

export function createStubReservationImportProvider(): {
  mapMessage: (
    message: ChannelProviderMessage,
    context: ChannelReservationImportContext,
  ) => Promise<ChannelReservationImportMapping>;
} {
  return {
    mapMessage: async () => ({
      kind: "unrecognized",
      reason: "Use ChannelImportSimulation with FakeChannelReservationImportProvider",
    }),
  };
}

export const FAKE_CHANNEL_PROVIDER_ID = "booking_com" satisfies ChannelSource;

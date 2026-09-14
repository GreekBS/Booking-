import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";

/** Provider-side reservation fields only — no internal catalog identifiers. */
export interface SimulatedExternalReservationPayload {
  checkIn: string;
  checkOut: string;
  guestCount: number;
  guest: {
    name: string;
    email: string;
    phone: string | null;
  };
  externalRevision?: string;
}

export const SIMULATED_BOOKING_ID = "550e8400-e29b-41d4-a716-446655449001";

export const DEFAULT_SIMULATED_FIXTURE: SimulatedExternalReservationPayload = {
  checkIn: "2027-08-01",
  checkOut: "2027-08-05",
  guestCount: 2,
  guest: {
    name: "Simulated Guest",
    email: "guest@example.com",
    phone: null,
  },
  externalRevision: "fake-rev-1",
};

export function buildSimulatedProviderMessage(input: {
  messageId: string;
  connectionId: string;
  provider: ChannelProviderMessage["provider"];
  externalListingId: string;
  externalUnitId?: string | null;
  externalReservationId: string;
  payload: SimulatedExternalReservationPayload;
  receivedAt?: Date;
  externalUpdatedAt?: string;
}): ChannelProviderMessage {
  return {
    messageId: input.messageId,
    kind: "reservation.create",
    receivedAt: input.receivedAt ?? new Date("2027-01-01T00:00:00.000Z"),
    connectionId: input.connectionId,
    provider: input.provider,
    payload: { ...input.payload },
    externalListingId: input.externalListingId,
    externalUnitId: input.externalUnitId ?? undefined,
    externalReservationId: input.externalReservationId,
    externalUpdatedAt: input.externalUpdatedAt,
  };
}

export function assertProviderSidePayload(payload: Record<string, unknown>): void {
  const forbiddenKeys = ["propertyId", "unitId", "mappingId", "tenantId", "bookingId"];
  for (const key of forbiddenKeys) {
    if (key in payload) {
      throw new Error(`Provider payload must not contain internal key: ${key}`);
    }
  }
}

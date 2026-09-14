import type { NormalizedReservationCommand } from "../../commerce/reservation/types";
import type { ExternalReservationReference } from "./ChannelTypes";

export interface ChannelReservationModifyMapping {
  externalReference: ExternalReservationReference;
  connectionId: string;
  proposed: {
    unitId: string;
    checkIn: string;
    checkOut: string;
    guestCount: number;
  };
  externalUpdatedAt?: string;
  idempotencyKey: string;
}

export interface ChannelReservationCancelMapping {
  externalReference: ExternalReservationReference;
  connectionId: string;
  reason?: string;
  cancelledAt?: string;
  idempotencyKey: string;
}

export type ChannelReservationImportMapping =
  | { kind: "create"; command: NormalizedReservationCommand }
  | { kind: "modify"; mapping: ChannelReservationModifyMapping }
  | { kind: "cancel"; mapping: ChannelReservationCancelMapping }
  | { kind: "unrecognized"; reason: string };

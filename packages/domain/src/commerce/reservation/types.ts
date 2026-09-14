import type { ChannelSource } from "../../channels/types/ChannelTypes";
import type { ActorContext } from "../../shared/services/PermissionChecker";
import type { ConfirmationMode, GuestDetailsProps } from "../shared/types/CommerceTypes";
import type { AvailabilityReason } from "../shared/types/CommerceTypes";
import type { Hold } from "../booking/domain/Hold";
import type { Quote } from "../booking/domain/Quote";
import type { Booking } from "../booking/domain/Booking";

export interface StayChangeDraft {
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
}

export interface ApplyStayChangeCommand extends StayChangeDraft {
  propertyId: string;
}

export interface StayChangePreviewTotals {
  checkIn: string;
  checkOut: string;
  unitId: string;
  guestCount: number;
  totalAmount: string;
  currency: string;
}

export interface StayChangePreview {
  available: boolean;
  unchanged: boolean;
  reasons: AvailabilityReason[];
  current: StayChangePreviewTotals;
  proposed: StayChangePreviewTotals | null;
  priceDelta: { amount: string; currency: string } | null;
}

export interface StayChangeCommitResult {
  booking: Booking;
  quote: Quote;
}

/** Internal command shape for all reservation write sources (P5 channel import). */
export interface NormalizedReservationCommand {
  tenantId: string;
  unitId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  guest: GuestDetailsProps;
  confirmationMode?: ConfirmationMode;
  source: ChannelSource;
  externalReference?: { source: ChannelSource; externalId: string };
}

/** Admin repricing quote validity after stay change (not hold TTL). */
export const STAY_CHANGE_QUOTE_TTL_MS = 24 * 60 * 60 * 1000;

export interface PrepareReservationCreateParams {
  reservation: NormalizedReservationCommand;
  holdId: string;
  quoteId: string;
  snapshotId: string;
  bookingId: string;
  propertyTimezone: string;
  idempotencyKey?: string | null;
  confirmationMode?: ConfirmationMode;
  quotedAt?: Date;
}

export interface PreparedReservationCreate {
  hold: Hold;
  quote: Quote;
  booking: Booking;
}

export interface ReservationCreateProfile {
  confirmImmediately: boolean;
  idempotencyKey: string | null;
  actor: ActorContext;
  writeAudit: boolean;
}

export interface CreateReservationCommand {
  reservation: NormalizedReservationCommand;
  profile: ReservationCreateProfile;
}

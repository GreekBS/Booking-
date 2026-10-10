import type { ChannelSource } from "../../channels/types/ChannelTypes";
import type { ActorContext } from "../../shared/services/PermissionChecker";
import type {
  BookingPricingIntent,
  ConfirmationMode,
  GuestDetailsProps,
} from "../shared/types/CommerceTypes";
import type { AvailabilityReason } from "../shared/types/CommerceTypes";
import type { Hold } from "../booking/domain/Hold";
import type { Quote } from "../booking/domain/Quote";
import type { Booking } from "../booking/domain/Booking";
import type { MutationOrigin } from "../../shared/types/MutationOrigin";

export interface StayChangeDraft {
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  /**
   * Operator stay-change commercial intent. Defaults to preserve_agreed_total.
   * Ignored for channel_compat_reprice commits.
   */
  pricingIntent?: BookingPricingIntent;
}

/**
 * Commercial policy for StayMutationEngine (BFS-1/BFS-2).
 * - operator: default preserve_agreed_total; recalculate preview allowed; recalculate commit gated until BFS-3; manual rejected.
 * - channel_compat_reprice: isolated OTA path keeping pre-BFS RatePlan reprice until BFS-7.
 */
export type StayChangeCommercialMode =
  | { source: "operator"; pricingIntent?: BookingPricingIntent }
  | { source: "channel_compat_reprice" };

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

/** Commercial breakdown for recalculate_from_rate_plan previews (BFS-2). */
export interface StayChangeProposedCommercial {
  subtotalAmount: string;
  feesAmount: string;
  taxesAmount: string;
  discountAmount: string;
  totalAmount: string;
  currency: string;
  lineItems: Array<{
    date: string;
    baseAmount: string;
    adjustedAmount: string;
    currency: string;
  }>;
  /** RatePlan content fingerprint used for confirmation binding. */
  ratePlanFingerprint: string;
  pricingFingerprint: string;
}

export interface StayChangePreview {
  available: boolean;
  unchanged: boolean;
  reasons: AvailabilityReason[];
  current: StayChangePreviewTotals;
  proposed: StayChangePreviewTotals | null;
  priceDelta: { amount: string; currency: string } | null;
  /** Effective commercial intent applied to this preview (operator path). */
  pricingIntent?: BookingPricingIntent;
  /** Present when pricingIntent is recalculate_from_rate_plan and available. */
  proposedCommercial?: StayChangeProposedCommercial | null;
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
  /** Trusted server-side provenance only — never from browsers. */
  mutationOrigin?: MutationOrigin | null;
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

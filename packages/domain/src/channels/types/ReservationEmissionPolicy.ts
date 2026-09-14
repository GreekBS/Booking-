import type { FeedSemanticMode } from "./FeedSemanticMode";

/**
 * Base CM-4b / S2: reservation.create emission is never authorized by semantic mode alone.
 *
 * `reservation_feed` is necessary context for future CM-4b-R but never sufficient.
 * CM-4b-R will extend this policy with separate eligibility config, connection
 * reservationImportEnabled, and feature flags — not by treating mode as Booking auth.
 */
export function mayEmitReservationCreate(input: {
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
}): boolean {
  void input;
  return false;
}

/**
 * Base CM-4b / S2: Booking-affecting cancellation is never authorized by semantic mode.
 * Evidence-only cancel kinds remain a later CM-4b-R policy concern.
 */
export function mayEmitBookingAffectingCancel(input: {
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
}): boolean {
  void input;
  return false;
}

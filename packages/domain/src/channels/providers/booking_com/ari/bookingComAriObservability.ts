export const BOOKING_COM_ARI_EVENTS = {
  PUSH_STARTED: "booking_ari_push_started",
  PUSH_SUCCESS: "booking_ari_push_success",
  PUSH_FAILURE: "booking_ari_push_failure",
  PARTIAL_ERROR: "booking_ari_partial_error",
  RETRY_SCHEDULED: "booking_ari_retry_scheduled",
  STALE_SUPPRESSED: "booking_ari_stale_suppressed",
} as const;

export type BookingComAriObservabilityEvent =
  (typeof BOOKING_COM_ARI_EVENTS)[keyof typeof BOOKING_COM_ARI_EVENTS];

export type BookingComAriLogFn = (fields: Record<string, unknown>) => void;

/** Safe structured fields only — never credentials/JWT/PAN/guest payloads. */
export function emitBookingComAriEvent(
  log: BookingComAriLogFn,
  event: BookingComAriObservabilityEvent,
  fields: {
    tenantId: string;
    connectionId: string;
    hotelId?: string | null;
    operationType?: string;
    dateFrom?: string;
    dateTo?: string;
    monthKey?: string;
    generation?: number;
    ruid?: string | null;
    errorCode?: string | null;
    httpStatus?: number | null;
  },
): void {
  log({
    event,
    provider: "booking_com",
    tenantId: fields.tenantId,
    connectionId: fields.connectionId,
    hotelId: fields.hotelId ?? null,
    operationType: fields.operationType ?? null,
    dateFrom: fields.dateFrom ?? null,
    dateTo: fields.dateTo ?? null,
    monthKey: fields.monthKey ?? null,
    generation: fields.generation ?? null,
    ruid: fields.ruid ?? null,
    errorCode: fields.errorCode ?? null,
    httpStatus: fields.httpStatus ?? null,
  });
}

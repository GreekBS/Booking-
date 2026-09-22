/**
 * Eligible active Booking.com connections for OTA retrieval scheduling (CM-4c-2).
 */
export interface EligibleBookingComRetrievalConnection {
  readonly tenantId: string;
  readonly connectionId: string;
}

export interface IEligibleBookingComRetrievalConnectionReader {
  listEligible(limit?: number): Promise<readonly EligibleBookingComRetrievalConnection[]>;
}

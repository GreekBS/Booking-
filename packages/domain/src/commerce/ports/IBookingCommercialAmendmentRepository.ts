import type { BookingCommercialAmendment } from "../amendment/BookingCommercialAmendment";

/**
 * Persistence for durable commercial amendments (BFS-3a).
 *
 * Implementations MUST join ambient `withTenantTransaction` when present so
 * BFS-3b can compose amendment insert with quote/booking/folio writes atomically.
 * Do not expose a public API that inserts amendments outside that apply TX.
 */
export type BookingCommercialAmendmentInsertResult =
  | { status: "created"; amendment: BookingCommercialAmendment }
  | { status: "idempotent_hit"; amendment: BookingCommercialAmendment }
  | { status: "idempotent_conflict"; existing: BookingCommercialAmendment };

export interface IBookingCommercialAmendmentRepository {
  /**
   * Insert amendment. On unique (tenantId, idempotencyKey) conflict, compare
   * exact commercial payload and return hit vs conflict.
   */
  insert(
    amendment: BookingCommercialAmendment,
  ): Promise<BookingCommercialAmendmentInsertResult>;

  findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<BookingCommercialAmendment | null>;

  listByBookingId(
    tenantId: string,
    bookingId: string,
  ): Promise<BookingCommercialAmendment[]>;
}

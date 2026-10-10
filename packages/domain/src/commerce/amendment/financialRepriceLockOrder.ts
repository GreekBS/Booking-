/**
 * Verified financial lock acquisition order (BFS-3b-1).
 *
 * Observed production paths (do not change payment behavior without approval):
 *
 * Payment create/allocate (`PaymentRepositories`):
 *   1. payments          FOR UPDATE (by id)
 *   2. folios            FOR UPDATE (ORDER BY id)
 *   3. bookings          FOR UPDATE (property check; single id)
 *
 * Fiscal folio-line allocation (`FiscalDocumentRepositories`):
 *   1. folio_lines       FOR UPDATE (ORDER BY id)
 *   2. fiscal_documents  FOR UPDATE (credit capacity path)
 *
 * Booking inventory locks (`BookingRepository.lockByIdsForUpdate`):
 *   1. bookings          FOR UPDATE (ORDER BY id ASC)
 *
 * Commercial amendment insert (BFS-3a): no row FOR UPDATE; uniqueness on
 * (tenant_id, idempotency_key) provides idempotency fencing.
 *
 * ---------------------------------------------------------------------------
 * BFS-3b apply TX design (future; not activated in BFS-3b-1):
 *
 * To avoid AB-BA deadlock with payment (folio → booking), apply MUST acquire:
 *   1. folios            FOR UPDATE (ORDER BY id) when a primary folio exists
 *   2. bookings          FOR UPDATE (ORDER BY id)
 *   3. (optional) folio_lines FOR UPDATE (ORDER BY id) only if a later phase
 *      needs line-level fencing beyond the folio lock
 *
 * When no primary folio exists: booking FOR UPDATE only.
 * Never lock payments in apply (payments are not mutated by reprice).
 *
 * Do NOT use booking → folio ordering in apply — that deadlocks with payment.
 */

export const BFS3B_APPLY_LOCK_ORDER = [
  "folios(ORDER BY id) when primary exists",
  "bookings(ORDER BY id)",
  "folio_lines(ORDER BY id) optional",
] as const;

/** Documented payment lock order — unchanged by BFS-3b-1. */
export const PAYMENT_LOCK_ORDER = [
  "payments(FOR UPDATE)",
  "folios(ORDER BY id FOR UPDATE)",
  "bookings(FOR UPDATE)",
] as const;

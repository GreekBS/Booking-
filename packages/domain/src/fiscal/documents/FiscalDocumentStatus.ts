/**
 * Fiscal document lifecycle.
 * F3 uses DRAFT → ISSUED only. Later states are reserved for F5/F6 —
 * do not fake external transmission in F3.
 */
export type FiscalDocumentStatus =
  | "DRAFT"
  | "ISSUED"
  | "PENDING_TRANSMISSION"
  | "TRANSMITTED"
  | "ACCEPTED"
  | "FAILED"
  | "PENDING_RECONCILE"
  | "CANCELLED"
  | "CREDITED";

export const F3_ACTIVE_STATUSES: readonly FiscalDocumentStatus[] = [
  "DRAFT",
  "ISSUED",
] as const;

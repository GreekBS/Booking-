import { parseConflictSnapshot } from "@hcp/domain";
import type {
  ReservationImportConflictBookingDto,
  ReservationImportRejectedRowDto,
  ReservationImportRowDto,
} from "@/lib/admin/reservation-import-api";

export type ReviewTabId = "all" | "action" | "ready" | "conflicts" | "rejected";

export interface ReadinessCounts {
  accepted: number;
  ready: number;
  skipped: number;
  needAction: number;
  rejected: number;
}

export function computeReadinessCounts(
  rows: ReservationImportRowDto[],
  rejectedRows: ReservationImportRejectedRowDto[],
): ReadinessCounts {
  let ready = 0;
  let skipped = 0;
  let needAction = 0;
  for (const row of rows) {
    if (row.status === "ready") ready += 1;
    else if (row.status === "skipped" || row.status === "skipped_already_imported") {
      skipped += 1;
    } else if (row.status === "pending" || row.status === "failed") {
      needAction += 1;
    }
  }
  return {
    accepted: rows.length,
    ready,
    skipped,
    needAction,
    rejected: rejectedRows.length,
  };
}

export function isNeedActionRow(row: ReservationImportRowDto): boolean {
  return row.status === "pending" || row.status === "failed";
}

export function isConflictTabRow(row: ReservationImportRowDto): boolean {
  const snap = parseConflictSnapshot(row.conflictSnapshot);
  return (
    snap.existingBookingIds.length > 0 ||
    snap.peerImportRowIds.length > 0 ||
    snap.nonBookingBlockers.length > 0 ||
    row.conflictResolution !== "undecided"
  );
}

export function filterRowsForTab(
  tab: ReviewTabId,
  rows: ReservationImportRowDto[],
): ReservationImportRowDto[] {
  switch (tab) {
    case "all":
      return rows;
    case "action":
      return rows.filter(isNeedActionRow);
    case "ready":
      return rows.filter((r) => r.status === "ready");
    case "conflicts":
      return rows.filter(isConflictTabRow);
    case "rejected":
      return [];
    default:
      return rows;
  }
}

export function tabCounts(
  rows: ReservationImportRowDto[],
  rejectedRows: ReservationImportRejectedRowDto[],
): Record<ReviewTabId, number> {
  return {
    all: rows.length,
    action: rows.filter(isNeedActionRow).length,
    ready: rows.filter((r) => r.status === "ready").length,
    conflicts: rows.filter(isConflictTabRow).length,
    rejected: rejectedRows.length,
  };
}

export function formatImportStayRange(checkIn: string, checkOut: string): string {
  try {
    const fmt = (d: string) =>
      new Date(`${d}T12:00:00`).toLocaleDateString("el-GR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    return `${fmt(checkIn)} → ${fmt(checkOut)}`;
  } catch {
    return `${checkIn} → ${checkOut}`;
  }
}

export type PriceDisplayKind =
  | "imported_csv"
  | "talos_calculated"
  | "operator_entered"
  | "unresolved";

export function priceDisplayKind(row: ReservationImportRowDto): PriceDisplayKind {
  if (row.priceSource === "imported_csv") return "imported_csv";
  if (row.priceSource === "talos_calculated") return "talos_calculated";
  if (row.priceSource === "operator_entered") return "operator_entered";
  return "unresolved";
}

export function priceDisplayLabel(kind: PriceDisplayKind): string {
  switch (kind) {
    case "imported_csv":
      return "Τιμή CSV";
    case "talos_calculated":
      return "Τιμή TALOS";
    case "operator_entered":
      return "Χειροκίνητη τιμή";
    default:
      return "Χωρίς τιμή";
  }
}

export function formatRowPriceAmount(row: ReservationImportRowDto): string | null {
  if (row.priceSource === "imported_csv" && row.importedTotalAmount && row.importedCurrency) {
    return `${row.importedTotalAmount} ${row.importedCurrency}`;
  }
  if (
    (row.priceSource === "talos_calculated" || row.priceSource === "operator_entered") &&
    row.operatorTotalAmount &&
    row.operatorCurrency
  ) {
    return `${row.operatorTotalAmount} ${row.operatorCurrency}`;
  }
  return null;
}

const BLOCKER_LABELS: Record<string, string> = {
  owner: "Μπλοκ ιδιοκτήτη",
  maintenance: "Συντήρηση",
  cleaning: "Καθαριότητα",
  manual: "Χειροκίνητο μπλοκ",
};

export function nonBookingBlockerLabel(blockType: string): string {
  return BLOCKER_LABELS[blockType.toLowerCase()] ?? `Μπλοκ (${blockType})`;
}

export function rowStatusLabel(status: string): string {
  switch (status) {
    case "ready":
      return "Έτοιμη";
    case "pending":
      return "Εκκρεμεί";
    case "skipped":
      return "Παραλείφθηκε";
    case "skipped_already_imported":
      return "Ήδη εισήχθη";
    case "failed":
      return "Αποτυχία";
    case "imported":
      return "Εισήχθη";
    case "replaced":
      return "Αντικαταστάθηκε";
    case "discarded":
      return "Απορρίφθηκε";
    default:
      return status;
  }
}

export function conflictBookingsForRow(
  row: ReservationImportRowDto,
  conflictBookings: ReservationImportConflictBookingDto[],
): ReservationImportConflictBookingDto[] {
  const snap = parseConflictSnapshot(row.conflictSnapshot);
  const ids = new Set(snap.existingBookingIds);
  for (const o of snap.overlaps) {
    if (o.otherKind === "existing_booking") ids.add(o.otherId);
  }
  const byId = new Map(conflictBookings.map((b) => [b.id, b]));
  return [...ids].map((id) => byId.get(id)).filter(Boolean) as ReservationImportConflictBookingDto[];
}

export function peerRowsForRow(
  row: ReservationImportRowDto,
  allRows: ReservationImportRowDto[],
): ReservationImportRowDto[] {
  const snap = parseConflictSnapshot(row.conflictSnapshot);
  const byId = new Map(allRows.map((r) => [r.id, r]));
  return snap.peerImportRowIds
    .map((id) => byId.get(id))
    .filter((r): r is ReservationImportRowDto => !!r);
}

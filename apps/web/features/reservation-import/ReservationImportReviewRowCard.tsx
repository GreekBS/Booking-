"use client";

import { parseConflictSnapshot } from "@hcp/domain";
import { StatusBadge } from "@/components/admin/status-badge";
import { Surface } from "@/components/admin/surface";
import type {
  ReservationImportConflictBookingDto,
  ReservationImportRowDto,
} from "@/lib/admin/reservation-import-api";
import {
  conflictBookingsForRow,
  formatImportStayRange,
  formatRowPriceAmount,
  nonBookingBlockerLabel,
  peerRowsForRow,
  priceDisplayKind,
  priceDisplayLabel,
  rowStatusLabel,
} from "./reservation-import-review-utils";

type Props = {
  row: ReservationImportRowDto;
  allRows: ReservationImportRowDto[];
  conflictBookings: ReservationImportConflictBookingDto[];
  unitLabel: (unitId: string) => string;
};

export function ReservationImportReviewRowCard({
  row,
  allRows,
  conflictBookings,
  unitLabel,
}: Props) {
  const snap = parseConflictSnapshot(row.conflictSnapshot);
  const bookings = conflictBookingsForRow(row, conflictBookings);
  const peers = peerRowsForRow(row, allRows);
  const priceKind = priceDisplayKind(row);
  const priceAmount = formatRowPriceAmount(row);
  const hasHardBlockers = snap.nonBookingBlockers.length > 0;

  return (
    <Surface variant="panel" padding="md" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">
            #{row.rowNumber} · {row.guestName}
          </p>
          <p className="text-xs text-muted-foreground">
            {row.externalReference} · {unitLabel(row.unitId)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {row.temporalClass === "historical" ? (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Ιστορική κράτηση
            </span>
          ) : null}
          <StatusBadge status={row.status} label={rowStatusLabel(row.status)} />
        </div>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Διαμονή</dt>
          <dd>{formatImportStayRange(row.checkIn, row.checkOut)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Επισκέπτες</dt>
          <dd>{row.guestCount}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Τιμή</dt>
          <dd>
            {priceDisplayLabel(priceKind)}
            {priceAmount ? ` · ${priceAmount}` : null}
          </dd>
        </div>
        {row.conflictResolution !== "undecided" ? (
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Απόφαση συγκρούσεων
            </dt>
            <dd className="font-mono text-xs">{row.conflictResolution}</dd>
          </div>
        ) : null}
      </dl>

      {row.errorCode || row.errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {row.errorMessage ?? row.errorCode}
        </p>
      ) : null}

      {hasHardBlockers ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-foreground">Μη-κρατησιακό μπλοκ</p>
          <p className="mt-1 text-muted-foreground">
            Δεν μπορεί να επιλυθεί με διατήρηση CSV ή υπάρχουσας κράτησης.
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {snap.nonBookingBlockers.map((b, i) => (
              <li key={`${b.blockType}-${i}`}>
                {nonBookingBlockerLabel(b.blockType)} ·{" "}
                {formatImportStayRange(b.checkIn, b.checkOut)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!hasHardBlockers && bookings.length > 0 ? (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">Επικάλυψη με υπάρχουσες κρατήσεις</p>
          <ul className="mt-2 space-y-2">
            {bookings.map((b) => (
              <li key={b.id} className="text-muted-foreground">
                <span className="text-foreground">{b.guestName}</span> ·{" "}
                {formatImportStayRange(b.checkIn, b.checkOut)}
                <span className="ml-1 font-mono text-xs">({b.id.slice(0, 8)}…)</span>
              </li>
            ))}
          </ul>
          {row.replaceBookingIds.length > 1 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Στόχοι αντικατάστασης ({row.replaceBookingIds.length}):{" "}
              {row.replaceBookingIds.map((id) => id.slice(0, 8)).join(", ")}…
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Οι επιλογές διατήρησης θα προστεθούν στο επόμενο βήμα (B3.3c).
          </p>
        </div>
      ) : null}

      {peers.length > 0 ? (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">Επικάλυψη με άλλες γραμμές CSV</p>
          <ul className="mt-2 space-y-2">
            {peers.map((p) => (
              <li key={p.id} className="text-muted-foreground">
                <span className="text-foreground">
                  #{p.rowNumber} {p.guestName}
                </span>{" "}
                · {formatImportStayRange(p.checkIn, p.checkOut)} · {p.externalReference}
                {p.conflictResolution === "keep_csv" ? (
                  <span className="ml-1 text-xs">(keep_csv)</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Μόνο μία επικαλυπτόμενη γραμμή CSV μπορεί να παραμείνει ως keep_csv.
          </p>
        </div>
      ) : null}
    </Surface>
  );
}

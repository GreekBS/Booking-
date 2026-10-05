"use client";

import { useState } from "react";
import { parseConflictSnapshot } from "@hcp/domain";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import type {
  ReservationImportConflictBookingDto,
  ReservationImportConflictResolutionDto,
  ReservationImportRowDto,
} from "@/lib/admin/reservation-import-api";
import {
  RESERVATION_IMPORT_CONFLICT_PROMPT,
  RESERVATION_IMPORT_HARD_BLOCKER_NO_DECISION,
  RESERVATION_IMPORT_KEEP_CSV_CONFIRM_MANY,
  RESERVATION_IMPORT_KEEP_CSV_CONFIRM_ONE,
  RESERVATION_IMPORT_KEEP_CSV_CONFIRM_PEERS,
  RESERVATION_IMPORT_KEEP_CSV_CONFIRM_TITLE,
  RESERVATION_IMPORT_KEEP_CSV_LABEL,
  RESERVATION_IMPORT_KEEP_CSV_NOT_YET_REPLACED,
  RESERVATION_IMPORT_KEEP_EXISTING_LABEL,
} from "./reservation-import-copy";
import {
  conflictBookingsForRow,
  conflictResolutionLabel,
  formatImportStayRange,
  nonBookingBlockerLabel,
  peerRowsForRow,
  rowAllowsConflictDecision,
  rowHasExistingBookingConflicts,
  rowHasHardBlockers,
  rowHasPeerConflicts,
} from "./reservation-import-review-utils";

type Props = {
  row: ReservationImportRowDto;
  allRows: ReservationImportRowDto[];
  conflictBookings: ReservationImportConflictBookingDto[];
  unitLabel: (unitId: string) => string;
  disabled?: boolean;
  deciding?: boolean;
  onDecide: (
    resolution: Exclude<ReservationImportConflictResolutionDto, "undecided">,
  ) => Promise<void>;
};

function ReservationSideCard({
  title,
  subtitle,
  guestName,
  dates,
  meta,
  selected,
}: {
  title: string;
  subtitle?: string;
  guestName: string;
  dates: string;
  meta?: string;
  selected?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-md border p-3 text-sm",
        selected ? "border-foreground ring-1 ring-foreground/20" : "bg-muted/20",
      ].join(" ")}
      aria-current={selected ? "true" : undefined}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      <p className="mt-1 font-medium text-foreground">{guestName}</p>
      <p className="text-muted-foreground">{dates}</p>
      {meta ? <p className="mt-1 text-xs text-muted-foreground">{meta}</p> : null}
    </div>
  );
}

export function ReservationImportConflictDecisionPanel({
  row,
  allRows,
  conflictBookings,
  unitLabel,
  disabled = false,
  deciding = false,
  onDecide,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const snap = parseConflictSnapshot(row.conflictSnapshot);
  const bookings = conflictBookingsForRow(row, conflictBookings);
  const peers = peerRowsForRow(row, allRows);
  const hasExisting = rowHasExistingBookingConflicts(row);
  const hasPeers = rowHasPeerConflicts(row);
  const hardBlocked = rowHasHardBlockers(row);
  const allowsDecision = rowAllowsConflictDecision(row);
  const resolution = row.conflictResolution;
  const existingCount = Math.max(bookings.length, snap.existingBookingIds.length);
  const controlsDisabled = disabled || deciding;

  if (hardBlocked) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-foreground">Μη-κρατησιακό μπλοκ</p>
        <p className="mt-1 text-muted-foreground">{RESERVATION_IMPORT_HARD_BLOCKER_NO_DECISION}</p>
        <ul className="mt-2 list-disc pl-5">
          {snap.nonBookingBlockers.map((b, i) => (
            <li key={`${b.blockType}-${i}`}>
              {nonBookingBlockerLabel(b.blockType)} ·{" "}
              {formatImportStayRange(b.checkIn, b.checkOut)}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!hasExisting && !hasPeers && resolution === "undecided") {
    return null;
  }

  const confirmDescription =
    existingCount > 1
      ? RESERVATION_IMPORT_KEEP_CSV_CONFIRM_MANY(existingCount)
      : existingCount === 1
        ? RESERVATION_IMPORT_KEEP_CSV_CONFIRM_ONE
        : RESERVATION_IMPORT_KEEP_CSV_CONFIRM_PEERS;

  async function applyKeepExisting() {
    await onDecide("keep_existing");
  }

  async function applyKeepCsv() {
    setConfirmOpen(false);
    await onDecide("keep_csv");
  }

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="conflict-decision-panel">
      {(hasExisting || hasPeers) && (
        <p className="text-sm font-medium text-foreground">{RESERVATION_IMPORT_CONFLICT_PROMPT}</p>
      )}

      <p className="text-sm" role="status" aria-live="polite">
        Τρέχουσα απόφαση:{" "}
        <strong
          className={
            resolution === "undecided" ? "font-medium text-muted-foreground" : "font-semibold"
          }
        >
          {conflictResolutionLabel(resolution)}
        </strong>
        {deciding ? <span className="ml-2 text-xs text-muted-foreground">Αποθήκευση…</span> : null}
      </p>

      {hasExisting ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Υπάρχουσες κρατήσεις ({existingCount})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {bookings.length > 0
              ? bookings.map((b) => (
                  <ReservationSideCard
                    key={b.id}
                    title="Υπάρχουσα κράτηση"
                    guestName={b.guestName}
                    dates={formatImportStayRange(b.checkIn, b.checkOut)}
                    meta={`Αναφ. ${b.id.slice(0, 8)}…`}
                    selected={resolution === "keep_existing"}
                  />
                ))
              : snap.existingBookingIds.map((id) => (
                  <ReservationSideCard
                    key={id}
                    title="Υπάρχουσα κράτηση"
                    guestName={`Κράτηση ${id.slice(0, 8)}…`}
                    dates="—"
                    meta={`Αναφ. ${id.slice(0, 8)}…`}
                    selected={resolution === "keep_existing"}
                  />
                ))}
          </div>

          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Κράτηση CSV
          </p>
          <ReservationSideCard
            title="Γραμμή CSV"
            subtitle={`#${row.rowNumber} · ${row.externalReference}`}
            guestName={row.guestName}
            dates={formatImportStayRange(row.checkIn, row.checkOut)}
            meta={`${unitLabel(row.unitId)} · ${row.guestCount} επισκέπτες`}
            selected={resolution === "keep_csv"}
          />

          {resolution === "keep_csv" && row.replaceBookingIds.length > 0 ? (
            <p className="text-xs text-muted-foreground" role="status">
              Στόχοι μελλοντικής αντικατάστασης ({row.replaceBookingIds.length}):{" "}
              {row.replaceBookingIds.map((id) => id.slice(0, 8)).join(", ")}…
              <span className="mt-1 block">{RESERVATION_IMPORT_KEEP_CSV_NOT_YET_REPLACED}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {hasPeers ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Επικάλυψη με άλλες γραμμές CSV
          </p>
          <div className="grid gap-2">
            <ReservationSideCard
              title="Αυτή η γραμμή CSV"
              subtitle={`#${row.rowNumber} · ${row.externalReference}`}
              guestName={row.guestName}
              dates={formatImportStayRange(row.checkIn, row.checkOut)}
              meta={`${unitLabel(row.unitId)} · ${conflictResolutionLabel(row.conflictResolution)} · ${row.status}`}
              selected={resolution === "keep_csv"}
            />
            {peers.map((p) => (
              <ReservationSideCard
                key={p.id}
                title="Άλλη γραμμή CSV"
                subtitle={`#${p.rowNumber} · ${p.externalReference}`}
                guestName={p.guestName}
                dates={formatImportStayRange(p.checkIn, p.checkOut)}
                meta={`${unitLabel(p.unitId)} · ${conflictResolutionLabel(p.conflictResolution)} · ${p.status}`}
                selected={p.conflictResolution === "keep_csv"}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Μόνο μία επικαλυπτόμενη γραμμή CSV μπορεί να παραμείνει ως «Διατήρηση CSV».
          </p>
        </div>
      ) : null}

      {allowsDecision ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant={resolution === "keep_existing" ? "default" : "outline"}
            disabled={controlsDisabled}
            aria-pressed={resolution === "keep_existing"}
            aria-label={`${RESERVATION_IMPORT_KEEP_EXISTING_LABEL} για γραμμή ${row.rowNumber}`}
            onClick={() => void applyKeepExisting()}
          >
            {deciding && resolution !== "keep_csv"
              ? "Αποθήκευση…"
              : RESERVATION_IMPORT_KEEP_EXISTING_LABEL}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={resolution === "keep_csv" ? "default" : "outline"}
            disabled={controlsDisabled}
            aria-pressed={resolution === "keep_csv"}
            aria-label={`${RESERVATION_IMPORT_KEEP_CSV_LABEL} για γραμμή ${row.rowNumber}`}
            onClick={() => setConfirmOpen(true)}
          >
            {RESERVATION_IMPORT_KEEP_CSV_LABEL}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !deciding) setConfirmOpen(false);
        }}
        title={RESERVATION_IMPORT_KEEP_CSV_CONFIRM_TITLE}
        description={confirmDescription}
        confirmLabel={RESERVATION_IMPORT_KEEP_CSV_LABEL}
        destructive
        loading={deciding}
        onConfirm={applyKeepCsv}
      />
    </div>
  );
}

"use client";

import { StatusBadge } from "@/components/admin/status-badge";
import { Surface } from "@/components/admin/surface";
import Link from "next/link";
import type {
  ReservationImportConflictBookingDto,
  ReservationImportConflictResolutionDto,
  ReservationImportRowDto,
} from "@/lib/admin/reservation-import-api";
import { ReservationImportConflictDecisionPanel } from "./ReservationImportConflictDecisionPanel";
import { ReservationImportPriceDecisionPanel } from "./ReservationImportPriceDecisionPanel";
import { RESERVATION_IMPORT_VIEW_BOOKING_LABEL } from "./reservation-import-copy";
import { importRowOperatorErrorMessage } from "./reservation-import-errors";
import {
  bookingDrawerHref,
  formatImportStayRange,
  formatRowPriceAmount,
  priceDisplayKind,
  priceDisplayLabel,
  rowAllowsPriceDecision,
  rowHasExistingBookingConflicts,
  rowHasHardBlockers,
  rowHasPeerConflicts,
  rowStatusLabel,
} from "./reservation-import-review-utils";

type Props = {
  row: ReservationImportRowDto;
  allRows: ReservationImportRowDto[];
  conflictBookings: ReservationImportConflictBookingDto[];
  unitLabel: (unitId: string) => string;
  decidingRowId?: string | null;
  pricingRowId?: string | null;
  decisionBusy?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  onDecideConflict?: (
    rowId: string,
    resolution: Exclude<ReservationImportConflictResolutionDto, "undecided">,
  ) => Promise<void>;
  onUseTalosPrice?: (rowId: string) => Promise<void>;
  onSaveManualPrice?: (rowId: string, amount: string, currency: string) => Promise<void>;
};

export function ReservationImportReviewRowCard({
  row,
  allRows,
  conflictBookings,
  unitLabel,
  decidingRowId = null,
  pricingRowId = null,
  decisionBusy = false,
  selectable = false,
  selected = false,
  onSelectedChange,
  onDecideConflict,
  onUseTalosPrice,
  onSaveManualPrice,
}: Props) {
  const priceKind = priceDisplayKind(row);
  const priceAmount = formatRowPriceAmount(row);
  const showConflictPanel =
    rowHasHardBlockers(row) ||
    rowHasExistingBookingConflicts(row) ||
    rowHasPeerConflicts(row) ||
    row.conflictResolution !== "undecided";
  const showPricePanel = rowAllowsPriceDecision(row) && onUseTalosPrice && onSaveManualPrice;
  const operatorError = importRowOperatorErrorMessage(row);

  const rowDeciding = decidingRowId === row.id;
  const rowPricing = pricingRowId === row.id;

  return (
    <Surface variant="panel" padding="md" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          {selectable ? (
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={selected}
              disabled={decisionBusy}
              aria-label={`Επιλογή γραμμής ${row.rowNumber}`}
              data-testid={`import-row-select-${row.id}`}
              onChange={(e) => onSelectedChange?.(e.target.checked)}
            />
          ) : null}
          <div>
            <p className="text-sm font-medium text-foreground">
              #{row.rowNumber} · {row.guestName}
            </p>
            <p className="text-xs text-muted-foreground">
              {row.externalReference} · {unitLabel(row.unitId)}
            </p>
          </div>
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
      </dl>

      {operatorError ? (
        <p className="text-sm text-destructive" role="alert">
          {operatorError}
        </p>
      ) : null}

      {row.createdBookingId ? (
        <p className="text-sm">
          <Link
            href={bookingDrawerHref(row.createdBookingId)}
            className="text-primary underline-offset-4 hover:underline"
          >
            {RESERVATION_IMPORT_VIEW_BOOKING_LABEL}
          </Link>
        </p>
      ) : null}

      {showPricePanel ? (
        <ReservationImportPriceDecisionPanel
          row={row}
          disabled={decisionBusy}
          deciding={rowPricing}
          onUseTalos={() => onUseTalosPrice(row.id)}
          onSaveManual={(amount, currency) => onSaveManualPrice(row.id, amount, currency)}
        />
      ) : null}

      {showConflictPanel && onDecideConflict ? (
        <ReservationImportConflictDecisionPanel
          row={row}
          allRows={allRows}
          conflictBookings={conflictBookings}
          unitLabel={unitLabel}
          disabled={decisionBusy}
          deciding={rowDeciding}
          onDecide={(resolution) => onDecideConflict(row.id, resolution)}
        />
      ) : null}
    </Surface>
  );
}

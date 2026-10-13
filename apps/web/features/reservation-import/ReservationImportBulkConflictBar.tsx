"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  RESERVATION_IMPORT_BULK_CLEAR,
  RESERVATION_IMPORT_BULK_KEEP_CSV,
  RESERVATION_IMPORT_BULK_KEEP_EXISTING,
  RESERVATION_IMPORT_BULK_PROGRESS,
  RESERVATION_IMPORT_BULK_SAVING_LABEL,
  RESERVATION_IMPORT_BULK_SELECT_ALL,
  RESERVATION_IMPORT_BULK_SELECTED,
} from "./reservation-import-copy";

type Props = {
  eligibleCount: number;
  selectedCount: number;
  allSelected: boolean;
  busy: boolean;
  progressDone?: number;
  progressTotal?: number;
  onToggleSelectAll: (selected: boolean) => void;
  onClear: () => void;
  onBulkKeepExisting: () => void;
  onBulkKeepCsv: () => void;
};

export function ReservationImportBulkConflictBar({
  eligibleCount,
  selectedCount,
  allSelected,
  busy,
  progressDone = 0,
  progressTotal = 0,
  onToggleSelectAll,
  onClear,
  onBulkKeepExisting,
  onBulkKeepCsv,
}: Props) {
  if (eligibleCount === 0) return null;

  return (
    <div
      className="sticky top-0 z-10 space-y-2 rounded-md border bg-background/95 p-3 shadow-sm backdrop-blur"
      data-testid="import-bulk-conflict-bar"
      aria-busy={busy}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={allSelected && eligibleCount > 0}
            disabled={busy || eligibleCount === 0}
            aria-label={RESERVATION_IMPORT_BULK_SELECT_ALL}
            data-testid="import-bulk-select-all"
            onChange={(e) => onToggleSelectAll(e.target.checked)}
          />
          {RESERVATION_IMPORT_BULK_SELECT_ALL}
        </label>
        <span className="text-sm text-muted-foreground" role="status">
          {RESERVATION_IMPORT_BULK_SELECTED(selectedCount)}
        </span>
        {busy ? (
          <span
            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
            aria-live="polite"
            data-testid="import-bulk-saving"
          >
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
            {RESERVATION_IMPORT_BULK_SAVING_LABEL}
            {progressTotal > 0
              ? ` · ${RESERVATION_IMPORT_BULK_PROGRESS(progressDone, progressTotal)}`
              : null}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || selectedCount === 0}
          data-testid="import-bulk-keep-existing"
          onClick={onBulkKeepExisting}
        >
          {RESERVATION_IMPORT_BULK_KEEP_EXISTING}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy || selectedCount === 0}
          data-testid="import-bulk-keep-csv"
          onClick={onBulkKeepCsv}
        >
          {RESERVATION_IMPORT_BULK_KEEP_CSV}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy || selectedCount === 0}
          onClick={onClear}
        >
          {RESERVATION_IMPORT_BULK_CLEAR}
        </Button>
      </div>
    </div>
  );
}

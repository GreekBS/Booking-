"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReservationImportRowDto } from "@/lib/admin/reservation-import-api";
import {
  RESERVATION_IMPORT_MANUAL_CURRENCY_DEFAULT,
  RESERVATION_IMPORT_MANUAL_PRICE_EDIT,
  RESERVATION_IMPORT_MANUAL_PRICE_FIELD,
  RESERVATION_IMPORT_MANUAL_PRICE_HINT,
  RESERVATION_IMPORT_MANUAL_PRICE_INVALID,
  RESERVATION_IMPORT_MANUAL_PRICE_LABEL,
  RESERVATION_IMPORT_MANUAL_PRICE_SAVE,
  RESERVATION_IMPORT_PRICE_MISSING_LABEL,
  RESERVATION_IMPORT_TALOS_UNAVAILABLE,
  RESERVATION_IMPORT_USE_TALOS_PRICE_LABEL,
} from "./reservation-import-copy";
import {
  formatRowPriceAmount,
  priceDisplayKind,
  priceDisplayLabel,
  rowAllowsPriceDecision,
  rowHasTalosPriceUnavailable,
  rowNeedsPriceDecision,
  validateManualImportTotalAmount,
} from "./reservation-import-review-utils";

type Props = {
  row: ReservationImportRowDto;
  disabled?: boolean;
  deciding?: boolean;
  onUseTalos: () => Promise<void>;
  onSaveManual: (amount: string, currency: string) => Promise<void>;
};

export function ReservationImportPriceDecisionPanel({
  row,
  disabled = false,
  deciding = false,
  onUseTalos,
  onSaveManual,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const allows = rowAllowsPriceDecision(row);
  const needsDecision = rowNeedsPriceDecision(row);
  const kind = priceDisplayKind(row);
  const persisted = formatRowPriceAmount(row);
  const talosFailed = rowHasTalosPriceUnavailable(row);
  const controlsDisabled = disabled || deciding;

  useEffect(() => {
    if (!dialogOpen) return;
    if (row.priceSource === "operator_entered" && row.operatorTotalAmount) {
      setAmount(row.operatorTotalAmount.replace(/\.?0+$/, "") || row.operatorTotalAmount);
    } else {
      setAmount("");
    }
    setClientError(null);
  }, [dialogOpen, row.priceSource, row.operatorTotalAmount]);

  if (!allows) return null;

  async function submitManual() {
    const err = validateManualImportTotalAmount(amount);
    if (err) {
      setClientError(RESERVATION_IMPORT_MANUAL_PRICE_INVALID);
      return;
    }
    const normalized = amount.trim().replace(",", ".");
    await onSaveManual(normalized, RESERVATION_IMPORT_MANUAL_CURRENCY_DEFAULT);
    setDialogOpen(false);
  }

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid="price-decision-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Τιμολόγηση
          </p>
          <p className="text-sm text-foreground" role="status">
            {needsDecision ? RESERVATION_IMPORT_PRICE_MISSING_LABEL : priceDisplayLabel(kind)}
            {persisted ? ` · ${persisted}` : null}
          </p>
        </div>
      </div>

      {talosFailed ? (
        <p className="text-sm text-destructive" role="alert">
          {RESERVATION_IMPORT_TALOS_UNAVAILABLE}
        </p>
      ) : null}

      {needsDecision ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={controlsDisabled}
            aria-label={`${RESERVATION_IMPORT_USE_TALOS_PRICE_LABEL} για γραμμή ${row.rowNumber}`}
            onClick={() => void onUseTalos()}
          >
            {deciding ? "Αποθήκευση…" : RESERVATION_IMPORT_USE_TALOS_PRICE_LABEL}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={controlsDisabled}
            aria-label={`${RESERVATION_IMPORT_MANUAL_PRICE_LABEL} για γραμμή ${row.rowNumber}`}
            onClick={() => setDialogOpen(true)}
          >
            {RESERVATION_IMPORT_MANUAL_PRICE_LABEL}
          </Button>
        </div>
      ) : null}

      {(row.priceSource === "operator_entered" || row.priceSource === "talos_calculated") &&
      allows ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={controlsDisabled}
            onClick={() => setDialogOpen(true)}
          >
            {row.priceSource === "operator_entered"
              ? RESERVATION_IMPORT_MANUAL_PRICE_EDIT
              : RESERVATION_IMPORT_MANUAL_PRICE_LABEL}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !deciding) setDialogOpen(false);
          else if (open) setDialogOpen(true);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{RESERVATION_IMPORT_MANUAL_PRICE_LABEL}</DialogTitle>
            <DialogDescription>{RESERVATION_IMPORT_MANUAL_PRICE_HINT}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`manual-price-${row.id}`}>
              {RESERVATION_IMPORT_MANUAL_PRICE_FIELD}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={`manual-price-${row.id}`}
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                disabled={deciding}
                aria-invalid={clientError ? true : undefined}
                aria-describedby={
                  clientError ? `manual-price-error-${row.id}` : `manual-price-hint-${row.id}`
                }
                onChange={(e) => {
                  setAmount(e.target.value);
                  setClientError(null);
                }}
              />
              <span className="text-sm text-muted-foreground" aria-hidden>
                {RESERVATION_IMPORT_MANUAL_CURRENCY_DEFAULT}
              </span>
            </div>
            <p id={`manual-price-hint-${row.id}`} className="text-xs text-muted-foreground">
              Νόμισμα: {RESERVATION_IMPORT_MANUAL_CURRENCY_DEFAULT} · συνολική τιμή διαμονής
            </p>
            {clientError ? (
              <p
                id={`manual-price-error-${row.id}`}
                className="text-sm text-destructive"
                role="alert"
              >
                {clientError}
              </p>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={deciding}
              onClick={() => setDialogOpen(false)}
            >
              Ακύρωση
            </Button>
            <Button type="button" disabled={deciding} onClick={() => void submitManual()}>
              {deciding ? "Αποθήκευση…" : RESERVATION_IMPORT_MANUAL_PRICE_SAVE}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

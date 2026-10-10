"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
} from "@/features/workspace/components/WorkspaceSection";
import { formatMoney } from "@/lib/admin/utils";
import { elCommon } from "@/lib/i18n";
import {
  FINANCIAL_REPRICE_REASON_MAX,
  FINANCIAL_REPRICE_REASON_MIN,
} from "./lib/financial-reprice-reason";
import {
  useBookingFinancialReprice,
  type FinancialRepriceCommittedStay,
} from "./hooks/useBookingFinancialReprice";
import type { FinancialRepriceApplyRecord } from "@/lib/admin/types";

type DialogStep = "reason" | "review";

export interface BookingFinancialRepriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null;
  committedStay: FinancialRepriceCommittedStay | null;
  onSuccess: (result: FinancialRepriceApplyRecord) => void;
}

function formatExpiry(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  try {
    return new Intl.DateTimeFormat("el-GR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

function formatSignedDelta(amount: string, currency: string): string {
  const n = Number.parseFloat(amount);
  if (Number.isNaN(n)) return formatMoney(amount, currency);
  const formatted = formatMoney(Math.abs(n).toFixed(4), currency);
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `−${formatted}`;
  return formatted;
}

/**
 * BFS-4 Phase 2 — two-step financial reprice dialog.
 * Authoritative totals come only from the server preview/apply responses.
 */
export function BookingFinancialRepriceDialog({
  open,
  onOpenChange,
  tenantId,
  committedStay,
  onSuccess,
}: BookingFinancialRepriceDialogProps) {
  const reasonId = useId();
  const confirmId = useId();
  const [step, setStep] = useState<DialogStep>("reason");
  const [confirmed, setConfirmed] = useState(false);
  const successHandledRef = useRef<string | null>(null);

  const reprice = useBookingFinancialReprice({
    tenantId,
    committedStay: open ? committedStay : null,
  });
  const { reset: resetReprice } = reprice;

  useEffect(() => {
    if (!open) {
      setStep("reason");
      setConfirmed(false);
      successHandledRef.current = null;
      resetReprice();
    }
  }, [open, resetReprice]);

  useEffect(() => {
    if (reprice.status === "preview_ready") {
      setStep("review");
      setConfirmed(false);
      return;
    }
    // Booking/tenant invalidation returns the hook to idle — leave review.
    if (
      reprice.status === "idle" &&
      step === "review" &&
      !reprice.preview
    ) {
      setStep("reason");
      setConfirmed(false);
    }
  }, [reprice.status, reprice.preview, step]);

  useEffect(() => {
    if (reprice.status !== "success" || !reprice.applyResult) return;
    if (committedStay && reprice.applyResult.bookingId !== committedStay.bookingId) {
      return;
    }
    const key = `${reprice.applyResult.bookingId}:${reprice.applyResult.amendmentId}`;
    if (successHandledRef.current === key) return;
    successHandledRef.current = key;
    onSuccess(reprice.applyResult);
    onOpenChange(false);
  }, [
    reprice.status,
    reprice.applyResult,
    committedStay,
    onSuccess,
    onOpenChange,
  ]);

  const preview = reprice.preview;
  const expiryLabel = preview
    ? formatExpiry(preview.confirmationExpiresAt)
    : null;

  const applyDisabled =
    !confirmed ||
    !reprice.canConfirmApply ||
    reprice.isBusy ||
    reprice.status === "applying";

  const retryDisabled =
    !confirmed || reprice.isBusy || !reprice.canRetryApply;

  function handleClose(next: boolean) {
    if (reprice.isBusy) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-h-[90vh] w-[calc(100%-1.5rem)] max-w-lg overflow-y-auto sm:w-full sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          // Keep focus inside dialog; default focuses first tabbable.
          if (step === "reason") return;
          e.preventDefault();
          const el = document.getElementById(confirmId);
          el?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Προσαρμογή συμφωνημένης τιμής</DialogTitle>
          <DialogDescription>
            {step === "reason"
              ? "Υπολογισμός νέας συμφωνημένης τιμής από το ρυθμισμένο RatePlan. Δεν εισπράττεται ούτε επιστρέφεται πληρωμή αυτόματα."
              : "Ελέγξτε τα ποσά από τον διακομιστή και επιβεβαιώστε ρητά πριν την εφαρμογή."}
          </DialogDescription>
        </DialogHeader>

        {step === "reason" ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-md border border-border bg-surface-subtle px-3 py-2 text-xs text-muted-foreground">
              <p>
                Η ενέργεια επανυπολογίζει μόνο την εμπορική συμφωνημένη τιμή
                διαμονής με βάση το RatePlan. Η γεωμετρία διαμονής δεν αλλάζει.
              </p>
              <p>
                Δεν εκτελείται αυτόματη είσπραξη ή επιστροφή χρημάτων. Ο
                λογαριασμός (folio) ενημερώνεται εμπορικά όπου εφαρμόζεται.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor={reasonId}>Λόγος προσαρμογής</Label>
              <Textarea
                id={reasonId}
                value={reprice.reason}
                onChange={(e) => reprice.setReason(e.target.value)}
                disabled={reprice.isBusy}
                rows={4}
                maxLength={FINANCIAL_REPRICE_REASON_MAX}
                placeholder="π.χ. Διόρθωση εμπορικής τιμής μετά από αλλαγή τιμοκαταλόγου"
                aria-describedby={`${reasonId}-hint`}
              />
              <p id={`${reasonId}-hint`} className="text-[11px] text-muted-foreground">
                Απαιτούνται τουλάχιστον {FINANCIAL_REPRICE_REASON_MIN} χαρακτήρες.
                Η προεπισκόπηση ξεκινά μόνο με ρητή ενέργειά σας.
              </p>
            </div>

            {reprice.error && reprice.status === "error" ? (
              <p className="text-sm text-destructive" role="alert">
                {reprice.error.message}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            {preview ? (
              <>
                <WorkspaceDetailList>
                  <WorkspaceDetailRow
                    label="Τρέχον συμφωνημένο σύνολο"
                    value={formatMoney(
                      preview.current.totalAmount,
                      preview.current.currency,
                    )}
                    bold
                  />
                  <WorkspaceDetailRow
                    label="Προτεινόμενο συμφωνημένο σύνολο"
                    value={
                      preview.proposed
                        ? formatMoney(
                            preview.proposed.totalAmount,
                            preview.proposed.currency,
                          )
                        : "—"
                    }
                    bold
                  />
                  <WorkspaceDetailRow
                    label="Διαφορά"
                    value={
                      preview.priceDelta
                        ? formatSignedDelta(
                            preview.priceDelta.amount,
                            preview.priceDelta.currency,
                          )
                        : "—"
                    }
                  />
                  <WorkspaceDetailRow
                    label="Νόμισμα"
                    value={preview.current.currency}
                  />
                </WorkspaceDetailList>

                {preview.proposedCommercial ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Εμπορική ανάλυση (προτεινόμενη)
                    </p>
                    <WorkspaceDetailList>
                      <WorkspaceDetailRow
                        label="Υποσύνολο νυχτών"
                        value={formatMoney(
                          preview.proposedCommercial.subtotalAmount,
                          preview.proposedCommercial.currency,
                        )}
                      />
                      <WorkspaceDetailRow
                        label="Τέλη"
                        value={formatMoney(
                          preview.proposedCommercial.feesAmount,
                          preview.proposedCommercial.currency,
                        )}
                      />
                      <WorkspaceDetailRow
                        label="Φόροι"
                        value={formatMoney(
                          preview.proposedCommercial.taxesAmount,
                          preview.proposedCommercial.currency,
                        )}
                      />
                      <WorkspaceDetailRow
                        label="Εκπτώσεις"
                        value={formatMoney(
                          preview.proposedCommercial.discountAmount,
                          preview.proposedCommercial.currency,
                        )}
                      />
                    </WorkspaceDetailList>
                  </div>
                ) : null}

                {expiryLabel ? (
                  <p className="text-[11px] text-muted-foreground">
                    Η επιβεβαίωση ισχύει έως {expiryLabel}. Μετά από αποτυχημένη
                    αποστολή εφαρμογής μπορείτε να δοκιμάσετε ξανά με την ίδια
                    επιβεβαίωση.
                  </p>
                ) : null}

                <div className="flex items-start gap-2 rounded-md border border-border px-3 py-2">
                  <input
                    id={confirmId}
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border"
                    checked={confirmed}
                    disabled={reprice.isBusy}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <Label htmlFor={confirmId} className="font-normal leading-snug">
                    Επιβεβαιώνω την εφαρμογή της νέας συμφωνημένης τιμής. Κατανοώ
                    ότι δεν γίνεται αυτόματη είσπραξη ή επιστροφή πληρωμής.
                  </Label>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Δεν υπάρχει ενεργή προεπισκόπηση.
              </p>
            )}

            {reprice.error && reprice.status === "error" ? (
              <div className="space-y-2" role="alert">
                <p className="text-sm text-destructive">{reprice.error.message}</p>
                {reprice.canRetryApply ? (
                  <p className="text-[11px] text-muted-foreground">
                    Η σύνδεση μπορεί να απέτυχε αφού ολοκληρώθηκε η ενέργεια.
                    Δοκιμάστε ξανά χωρίς νέα προεπισκόπηση.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "reason" ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={reprice.isBusy}
                onClick={() => handleClose(false)}
              >
                {elCommon.cancel}
              </Button>
              <Button
                type="button"
                disabled={!reprice.canPreview || reprice.isBusy}
                onClick={() => void reprice.requestPreview()}
              >
                {reprice.status === "previewing"
                  ? "Προεπισκόπηση…"
                  : "Προεπισκόπηση"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={reprice.isBusy}
                onClick={() => {
                  if (reprice.error?.requiresNewPreview || !reprice.preview) {
                    reprice.reset();
                    setStep("reason");
                    setConfirmed(false);
                    return;
                  }
                  setStep("reason");
                  setConfirmed(false);
                }}
              >
                Πίσω
              </Button>
              {reprice.canRetryApply ? (
                <Button
                  type="button"
                  disabled={retryDisabled}
                  onClick={() => void reprice.retryApply()}
                >
                  {reprice.status === "applying"
                    ? "Επαναληπτική εφαρμογή…"
                    : "Επανάληψη εφαρμογής"}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={applyDisabled}
                  onClick={() => void reprice.confirmApply()}
                >
                  {reprice.status === "applying"
                    ? "Εφαρμογή…"
                    : "Εφαρμογή νέας τιμής"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

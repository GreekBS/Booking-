"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceSection } from "@/features/workspace/components/WorkspaceSection";
import type { BookingRecord, QuoteRecord } from "@/lib/admin/types";
import type { FinancialRepriceApplyRecord } from "@/lib/admin/types";
import { evaluateFinancialRepriceEligibility } from "../lib/financial-reprice-eligibility";
import { BookingFinancialRepriceDialog } from "../BookingFinancialRepriceDialog";
import type { FinancialRepriceCommittedStay } from "../hooks/useBookingFinancialReprice";

export interface BookingFinancialRepricePanelProps {
  tenantId: string | null;
  booking: BookingRecord;
  quote: QuoteRecord | null;
  canAdjust: boolean;
  stayDirty: boolean;
  onApplied: (result: FinancialRepriceApplyRecord) => void;
}

/**
 * Financials-tab entry for BFS-4 financial reprice.
 * Hidden when the operator lacks financial-adjust UX permission.
 */
export function BookingFinancialRepricePanel({
  tenantId,
  booking,
  quote,
  canAdjust,
  stayDirty,
  onApplied,
}: BookingFinancialRepricePanelProps) {
  const [open, setOpen] = useState(false);

  // Booking/tenant/auth changes must close any open confirmation workflow.
  useEffect(() => {
    setOpen(false);
  }, [booking.id, tenantId, canAdjust]);

  const eligibility = useMemo(
    () =>
      evaluateFinancialRepriceEligibility({
        canAdjust,
        stayDirty,
        bookingStatus: booking.status,
        pricingMode: quote ? quote.pricingMode : undefined,
        hasQuote: Boolean(quote),
      }),
    [canAdjust, stayDirty, booking.status, quote],
  );

  const committedStay = useMemo<FinancialRepriceCommittedStay | null>(() => {
    if (!quote) return null;
    return {
      bookingId: booking.id,
      unitId: booking.unitId,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      guestCount: booking.guestCount,
      quoteId: quote.id,
    };
  }, [booking, quote]);

  if (!eligibility.visible) return null;

  return (
    <WorkspaceSection title="Συμφωνημένη τιμή">
      <p className="text-[11px] text-muted-foreground">
        Επανυπολογισμός της εμπορικής συμφωνημένης τιμής από το RatePlan, χωρίς
        αυτόματη πληρωμή ή επιστροφή.
      </p>

      {eligibility.message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {eligibility.message}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!eligibility.enabled}
        onClick={() => setOpen(true)}
        data-testid="financial-reprice-open"
      >
        Προσαρμογή συμφωνημένης τιμής
      </Button>

      <BookingFinancialRepriceDialog
        open={open}
        onOpenChange={setOpen}
        tenantId={tenantId}
        committedStay={committedStay}
        onSuccess={onApplied}
      />
    </WorkspaceSection>
  );
}

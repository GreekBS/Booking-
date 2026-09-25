"use client";

import { formatMoney } from "@/lib/admin/utils";
import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";
import type { BookingPricingSectionProps } from "../types";

/**
 * Commercial reservation pricing from Quote — not Folio settlement truth.
 */
export function BookingPricingSection({
  quote,
  discountTotal,
  proposedPreview,
}: BookingPricingSectionProps) {
  return (
    <WorkspaceSection title="Reservation pricing">
      <p className="text-[11px] text-muted-foreground">
        Quote / commercial stay price. Folio settlement is shown separately below.
      </p>
      {quote ? (
        <>
          {proposedPreview ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Proposed total after stay change:{" "}
              {formatMoney(proposedPreview.totalAmount, proposedPreview.currency)}
            </p>
          ) : null}
          <WorkspaceDetailList>
            <WorkspaceDetailRow
              label="Nightly total"
              value={formatMoney(quote.subtotalAmount, quote.currency)}
            />
            <WorkspaceDetailRow
              label="Fees"
              value={formatMoney(quote.feesAmount, quote.currency)}
            />
            <WorkspaceDetailRow
              label="Taxes (quote)"
              value={formatMoney(quote.taxesAmount, quote.currency)}
            />
            {discountTotal !== null ? (
              <WorkspaceDetailRow
                label="Discounts"
                value={`−${formatMoney(String(discountTotal), quote.currency)}`}
              />
            ) : null}
            <WorkspaceDetailRow
              label="Reservation total"
              value={formatMoney(quote.totalAmount, quote.currency)}
              bold
            />
          </WorkspaceDetailList>
          {quote.lineItems.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="border-b border-border bg-surface-subtle px-3 py-2 text-xs font-medium text-muted-foreground">
                Nightly breakdown
              </div>
              <div className="max-h-40 overflow-y-auto">
                {quote.lineItems.map((line) => (
                  <div
                    key={line.date}
                    className="flex justify-between border-b border-border/60 px-3 py-1.5 text-xs last:border-0"
                  >
                    <span className="text-muted-foreground">{line.date}</span>
                    <span className="tabular-nums">
                      {formatMoney(line.adjustedAmount, line.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Quote unavailable</p>
      )}
    </WorkspaceSection>
  );
}

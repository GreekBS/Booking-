"use client";

import { formatMoney } from "@/lib/admin/utils";
import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";
import type { BookingPricingSectionProps } from "../types";

export function BookingPricingSection({
  quote,
  discountTotal,
  proposedPreview,
}: BookingPricingSectionProps) {
  return (
    <WorkspaceSection title="Pricing">
      {quote ? (
        <>
          {proposedPreview && (
            <p className="mb-2 text-xs text-muted-foreground">
              Proposed total:{" "}
              {formatMoney(proposedPreview.totalAmount, proposedPreview.currency)}
            </p>
          )}
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
              label="Taxes"
              value={formatMoney(quote.taxesAmount, quote.currency)}
            />
            {discountTotal !== null && (
              <WorkspaceDetailRow
                label="Discounts"
                value={`−${formatMoney(String(discountTotal), quote.currency)}`}
              />
            )}
            <WorkspaceDetailRow
              label="Grand total"
              value={formatMoney(quote.totalAmount, quote.currency)}
              bold
            />
          </WorkspaceDetailList>
          {quote.lineItems.length > 0 && (
            <div className="overflow-hidden rounded-md border">
              <div className="border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                Nightly breakdown
              </div>
              <div className="max-h-40 overflow-y-auto">
                {quote.lineItems.map((line) => (
                  <div
                    key={line.date}
                    className="flex justify-between border-b px-3 py-1.5 text-xs last:border-0"
                  >
                    <span className="text-muted-foreground">{line.date}</span>
                    <span className="tabular-nums">
                      {formatMoney(line.adjustedAmount, line.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Quote unavailable</p>
      )}
    </WorkspaceSection>
  );
}

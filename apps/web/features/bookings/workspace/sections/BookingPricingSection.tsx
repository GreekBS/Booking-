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
  summary = false,
}: BookingPricingSectionProps) {
  return (
    <WorkspaceSection title="Τιμολόγηση κράτησης">
      <p className="text-xs text-foreground/70">
        Εμπορική τιμή διαμονής (προσφορά). Ο λογαριασμός (folio) εμφανίζεται στα Οικονομικά.
      </p>
      {quote ? (
        <>
          {proposedPreview ? (
            <p className="mb-2 text-xs text-foreground/70">
              Προτεινόμενο σύνολο μετά από αλλαγή διαμονής:{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {formatMoney(proposedPreview.totalAmount, proposedPreview.currency)}
              </span>
            </p>
          ) : null}
          <WorkspaceDetailList>
            <WorkspaceDetailRow
              label="Σύνολο νυχτών"
              value={formatMoney(quote.subtotalAmount, quote.currency)}
            />
            <WorkspaceDetailRow
              label="Τέλη"
              value={formatMoney(quote.feesAmount, quote.currency)}
            />
            <WorkspaceDetailRow
              label="Φόροι (προσφορά)"
              value={formatMoney(quote.taxesAmount, quote.currency)}
            />
            {discountTotal !== null ? (
              <WorkspaceDetailRow
                label="Εκπτώσεις"
                value={`−${formatMoney(String(discountTotal), quote.currency)}`}
              />
            ) : null}
            <WorkspaceDetailRow
              label="Σύνολο κράτησης"
              value={formatMoney(quote.totalAmount, quote.currency)}
              bold
            />
          </WorkspaceDetailList>
          {!summary && quote.lineItems.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="border-b border-border bg-surface-subtle px-3 py-2 text-xs font-medium text-foreground/70">
                Ανάλυση ανά νύχτα
              </div>
              <div className="max-h-40 overflow-y-auto">
                {quote.lineItems.map((line) => (
                  <div
                    key={line.date}
                    className="flex justify-between border-b border-border/60 px-3 py-1.5 text-xs last:border-0"
                  >
                    <span className="text-foreground/70">{line.date}</span>
                    <span className="tabular-nums text-foreground">
                      {formatMoney(line.adjustedAmount, line.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-foreground/70">Η προσφορά δεν είναι διαθέσιμη</p>
      )}
    </WorkspaceSection>
  );
}

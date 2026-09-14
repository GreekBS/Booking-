"use client";

import { formatMoney } from "@/lib/admin/utils";
import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";
import type { BookingSectionProps } from "../types";

export function BookingPaymentsSection({ quote }: BookingSectionProps) {
  return (
    <WorkspaceSection
      title="Payments"
      badge={
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Coming in P3
        </span>
      }
    >
      <WorkspaceDetailList>
        <WorkspaceDetailRow
          label="Reservation total"
          value={quote ? formatMoney(quote.totalAmount, quote.currency) : "—"}
        />
        <WorkspaceDetailRow label="Paid" value="—" />
        <WorkspaceDetailRow label="Remaining" value="—" />
      </WorkspaceDetailList>
      <div className="rounded-md border border-dashed bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground">
        Payment history and folio management coming in P3.
      </div>
    </WorkspaceSection>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { formatMoney } from "@/lib/admin/utils";
import { adminFetch } from "@/lib/admin/api";
import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";
import type { BookingSectionProps } from "../types";

interface FolioLineDto {
  id: string;
  lineType: string;
  description: string;
  amount: string;
  currency: string;
  sourceType: string;
  sortOrder: number;
}

interface FolioBalanceDto {
  currency: string;
  chargesSubtotal: string;
  discountsTotal: string;
  feesTotal: string;
  taxesTotal: string;
  folioTotal: string;
  paidAmount: string;
  paidAmountSource: string;
  outstandingBalance: string;
}

interface FolioDto {
  id: string;
  folioKey: string;
  label: string | null;
  currency: string;
  status: string;
  lines: FolioLineDto[];
  balance: FolioBalanceDto;
}

export function BookingPaymentsSection({ booking }: BookingSectionProps) {
  const { tenantId } = useTenant();
  const [folios, setFolios] = useState<FolioDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!booking?.id || !tenantId) return;
    setLoading(true);
    setError(null);
    try {
      // Idempotent open of primary folio, then list (supports multi-folio later).
      await adminFetch(`/bookings/${booking.id}/folios`, {
        method: "POST",
        tenantId,
        body: JSON.stringify({}),
      });
      const listed = await adminFetch<{ folios: FolioDto[] }>(
        `/bookings/${booking.id}/folios`,
        { tenantId },
      );
      setFolios(listed.folios ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folio");
      setFolios([]);
    } finally {
      setLoading(false);
    }
  }, [booking?.id, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <WorkspaceSection title="Folio">
      {loading && (
        <p className="text-sm text-muted-foreground">Loading folio…</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!loading && !error && folios.length === 0 && (
        <p className="text-sm text-muted-foreground">No folio yet.</p>
      )}
      {!loading &&
        folios.map((folio) => (
          <div key={folio.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">
                {folio.label ?? folio.folioKey}
                <span className="ml-2 text-xs font-normal uppercase tracking-wide text-muted-foreground">
                  {folio.folioKey} · {folio.status}
                </span>
              </p>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {folio.lines.map((line) => (
                    <tr key={line.id} className="border-t">
                      <td className="px-3 py-2">
                        <div>{line.description}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {line.sourceType}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {line.lineType}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(line.amount, line.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <WorkspaceDetailList>
              <WorkspaceDetailRow
                label="Charges"
                value={formatMoney(
                  folio.balance.chargesSubtotal,
                  folio.balance.currency,
                )}
              />
              <WorkspaceDetailRow
                label="Fees"
                value={formatMoney(folio.balance.feesTotal, folio.balance.currency)}
              />
              <WorkspaceDetailRow
                label="Taxes"
                value={formatMoney(
                  folio.balance.taxesTotal,
                  folio.balance.currency,
                )}
              />
              <WorkspaceDetailRow
                label="Folio total"
                value={formatMoney(
                  folio.balance.folioTotal,
                  folio.balance.currency,
                )}
              />
              <WorkspaceDetailRow
                label="Paid"
                value={formatMoney(
                  folio.balance.paidAmount,
                  folio.balance.currency,
                )}
              />
              <WorkspaceDetailRow
                label="Outstanding"
                value={formatMoney(
                  folio.balance.outstandingBalance,
                  folio.balance.currency,
                )}
              />
            </WorkspaceDetailList>
            <p className="text-[11px] text-muted-foreground">
              Paid is zero until Payment allocations exist (F4). Quote fee/tax
              placeholders are not Greek fiscal VAT.
            </p>
          </div>
        ))}
    </WorkspaceSection>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { formatMoney } from "@/lib/admin/utils";
import { adminFetch } from "@/lib/admin/api";
import { Button } from "@/components/ui/button";
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
  taxSnapshot?: {
    taxType: string;
    appliedRatePercent: string | null;
    jurisdiction: string;
  } | null;
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
  vatTotal?: string;
  leviesTotal?: string;
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
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!booking?.id || !tenantId) return;
    setLoading(true);
    setError(null);
    try {
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

  async function evaluateTaxes(folioId: string) {
    if (!tenantId) return;
    setEvaluating(true);
    try {
      await adminFetch(`/folios/${folioId}/evaluate-taxes`, {
        method: "POST",
        tenantId,
        body: JSON.stringify({ amountBasis: "NET" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tax evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }

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
        folios.map((folio) => {
          const net = folio.balance.chargesSubtotal;
          const vat = folio.balance.vatTotal ?? "0.0000";
          const levies = folio.balance.leviesTotal ?? "0.0000";
          return (
            <div key={folio.id} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">
                  {folio.label ?? folio.folioKey}
                  <span className="ml-2 text-xs font-normal uppercase tracking-wide text-muted-foreground">
                    {folio.folioKey} · {folio.status}
                  </span>
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={evaluating}
                  onClick={() => void evaluateTaxes(folio.id)}
                >
                  Evaluate taxes
                </Button>
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
                            {line.taxSnapshot
                              ? ` · ${line.taxSnapshot.taxType}`
                              : ""}
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
                  label="Net (charges)"
                  value={formatMoney(net, folio.balance.currency)}
                />
                <WorkspaceDetailRow
                  label="VAT"
                  value={formatMoney(vat, folio.balance.currency)}
                />
                <WorkspaceDetailRow
                  label="Other levies (e.g. climate fee)"
                  value={formatMoney(levies, folio.balance.currency)}
                />
                <WorkspaceDetailRow
                  label="Gross / folio total"
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
                Tax lines are append-only snapshots. Climate Resilience Fee is not
                VAT and will require a separate legal document in F3. No invoice /
                myDATA actions here.
              </p>
            </div>
          );
        })}
    </WorkspaceSection>
  );
}

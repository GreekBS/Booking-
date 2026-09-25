"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { formatMoney } from "@/lib/admin/utils";
import { adminFetch } from "@/lib/admin/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";
import type { BookingSectionProps } from "../types";
import { FolioFiscalIssuePanel } from "@/features/fiscal/FolioFiscalIssuePanel";

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
  netSettledAmount?: string;
  allocatedPaidAmount?: string;
  refundedAmount?: string;
  overpaymentAmount?: string;
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

interface PaymentDto {
  id: string;
  amount: string;
  currency: string;
  status: string;
  method: string;
  collectionSource: string;
  receivedAt: string;
  payerName: string | null;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `pay-${Date.now()}`;
}

export function BookingPaymentsSection({ booking }: BookingSectionProps) {
  const { tenantId } = useTenant();
  const [folios, setFolios] = useState<FolioDto[]>([]);
  const [payments, setPayments] = useState<PaymentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER">(
    "CASH",
  );
  const [collectionSource, setCollectionSource] = useState<
    "PROPERTY" | "DIRECT"
  >("PROPERTY");
  const [allocatePrimary, setAllocatePrimary] = useState(true);

  const primaryFolio = useMemo(
    () => folios.find((f) => f.folioKey === "primary") ?? folios[0],
    [folios],
  );

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
      const summary = await adminFetch<{
        payments: PaymentDto[];
        folios: FolioDto[];
      }>(`/bookings/${booking.id}/payments`, { tenantId });
      setFolios(summary.folios ?? []);
      setPayments(summary.payments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load folio");
      setFolios([]);
      setPayments([]);
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

  async function recordPayment() {
    if (!tenantId || !booking?.id || !payAmount.trim()) return;
    setRecording(true);
    setError(null);
    try {
      const currency = primaryFolio?.currency ?? "EUR";
      const body: Record<string, unknown> = {
        amount: payAmount.trim(),
        currency,
        method: payMethod,
        collectionSource,
        propertyId: booking.propertyId,
        bookingId: booking.id,
        idempotencyKey: newIdempotencyKey(),
      };
      if (allocatePrimary && primaryFolio) {
        body.initialAllocations = [
          { folioId: primaryFolio.id, amount: payAmount.trim() },
        ];
      }
      await adminFetch("/payments", {
        method: "POST",
        tenantId,
        body: JSON.stringify(body),
      });
      setPayAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setRecording(false);
    }
  }

  return (
    <>
      <WorkspaceSection title="Payments">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading payments…</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!loading && payments.length === 0 && (
          <p className="text-sm text-muted-foreground">No payments recorded.</p>
        )}
        {payments.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Received</th>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-2">
                      {new Date(p.receivedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {p.method} · {p.collectionSource}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(p.amount, p.currency)}
                    </td>
                    <td className="px-3 py-2">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">Record payment</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="pay-amount">Amount</Label>
              <Input
                id="pay-amount"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-method">Method</Label>
              <select
                id="pay-method"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={payMethod}
                onChange={(e) =>
                  setPayMethod(e.target.value as typeof payMethod)
                }
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-source">Collection source</Label>
              <select
                id="pay-source"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={collectionSource}
                onChange={(e) =>
                  setCollectionSource(e.target.value as typeof collectionSource)
                }
              >
                <option value="PROPERTY">Property</option>
                <option value="DIRECT">Direct</option>
              </select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <input
                id="pay-allocate"
                type="checkbox"
                checked={allocatePrimary}
                disabled={!primaryFolio}
                onChange={(e) => setAllocatePrimary(e.target.checked)}
              />
              <Label htmlFor="pay-allocate" className="font-normal">
                Allocate to primary folio
              </Label>
            </div>
          </div>
          <Button
            size="sm"
            disabled={recording || !payAmount.trim()}
            onClick={() => void recordPayment()}
          >
            Record payment
          </Button>
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Folio">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading folio…</p>
        )}
        {!loading && !error && folios.length === 0 && (
          <p className="text-sm text-muted-foreground">No folio yet.</p>
        )}
        {!loading &&
          folios.map((folio) => {
            const net = folio.balance.chargesSubtotal;
            const vat = folio.balance.vatTotal ?? "0.0000";
            const levies = folio.balance.leviesTotal ?? "0.0000";
            const netSettled =
              folio.balance.netSettledAmount ?? folio.balance.paidAmount;
            const refunded = folio.balance.refundedAmount ?? "0.0000";
            const overpay = folio.balance.overpaymentAmount ?? "0.0000";
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
                        <th className="px-3 py-2 text-right font-medium">
                          Amount
                        </th>
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
                    label="Paid (net settled)"
                    value={formatMoney(netSettled, folio.balance.currency)}
                  />
                  {folio.balance.allocatedPaidAmount && (
                    <WorkspaceDetailRow
                      label="Allocated (gross)"
                      value={formatMoney(
                        folio.balance.allocatedPaidAmount,
                        folio.balance.currency,
                      )}
                    />
                  )}
                  <WorkspaceDetailRow
                    label="Refunded (allocation reversals)"
                    value={formatMoney(refunded, folio.balance.currency)}
                  />
                  <WorkspaceDetailRow
                    label="Outstanding"
                    value={formatMoney(
                      folio.balance.outstandingBalance,
                      folio.balance.currency,
                    )}
                  />
                  <WorkspaceDetailRow
                    label="Overpayment"
                    value={formatMoney(overpay, folio.balance.currency)}
                  />
                </WorkspaceDetailList>
                <FolioFiscalIssuePanel
                  folioId={folio.id}
                  propertyId={booking.propertyId}
                  lines={folio.lines.map((l) => ({
                    id: l.id,
                    description: l.description,
                    amount: l.amount,
                    currency: l.currency,
                    lineType: l.lineType,
                    taxSnapshot: l.taxSnapshot
                      ? { taxType: l.taxSnapshot.taxType }
                      : null,
                  }))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Tax lines are append-only snapshots. Climate fee uses a separate
                  Special Element document. Issuance is local only — pending
                  fiscalization integration (no AADE/MARK).
                </p>
              </div>
            );
          })}
      </WorkspaceSection>
    </>
  );
}

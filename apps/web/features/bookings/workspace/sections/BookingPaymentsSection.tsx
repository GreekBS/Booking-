"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { formatMoney } from "@/lib/admin/utils";
import { adminFetch } from "@/lib/admin/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export interface BookingPaymentsSectionProps extends BookingSectionProps {
  /** When false, skip loading (tab lazy-load). Default true for calendar host. */
  active?: boolean;
  onOutstandingChange?: (label: string | null) => void;
}

export function BookingPaymentsSection({
  booking,
  active = true,
  onOutstandingChange,
}: BookingPaymentsSectionProps) {
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
  const [collectionSource, setCollectionSource] = useState<"PROPERTY" | "DIRECT">(
    "PROPERTY",
  );
  const [allocatePrimary, setAllocatePrimary] = useState(true);

  const primaryFolio = useMemo(
    () => folios.find((f) => f.folioKey === "primary") ?? folios[0],
    [folios],
  );

  const load = useCallback(async () => {
    if (!booking?.id || !tenantId || !active) return;
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
  }, [booking?.id, tenantId, active]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!onOutstandingChange) return;
    if (!primaryFolio) {
      onOutstandingChange(null);
      return;
    }
    onOutstandingChange(
      formatMoney(
        primaryFolio.balance.outstandingBalance,
        primaryFolio.balance.currency,
      ),
    );
  }, [primaryFolio, onOutstandingChange]);

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

  if (!active) return null;

  return (
    <div className="space-y-6">
      <WorkspaceSection title="Payments">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading payments…</p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!loading && payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded.</p>
        ) : null}
        {payments.length > 0 ? (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-9 text-xs">Received</TableHead>
                  <TableHead className="h-9 text-xs">Method</TableHead>
                  <TableHead className="h-9 text-right text-xs">Amount</TableHead>
                  <TableHead className="h-9 text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="py-2 text-xs">
                      {new Date(p.receivedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {p.method} · {p.collectionSource}
                    </TableCell>
                    <TableCell className="py-2 text-right text-xs tabular-nums">
                      {formatMoney(p.amount, p.currency)}
                    </TableCell>
                    <TableCell className="py-2">
                      <StatusBadge status={p.status.toLowerCase()} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        <div className="mt-3 space-y-3 rounded-md border border-border bg-surface-subtle/40 p-3">
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
              <Select
                value={payMethod}
                onValueChange={(v) => setPayMethod(v as typeof payMethod)}
              >
                <SelectTrigger id="pay-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="CARD">Card</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-source">Collection source</Label>
              <Select
                value={collectionSource}
                onValueChange={(v) =>
                  setCollectionSource(v as typeof collectionSource)
                }
              >
                <SelectTrigger id="pay-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROPERTY">Property</SelectItem>
                  <SelectItem value="DIRECT">Direct</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <input
                id="pay-allocate"
                type="checkbox"
                className="h-4 w-4 rounded border-border"
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

      <WorkspaceSection title="Folio / Account">
        <p className="text-[11px] text-muted-foreground">
          Settlement truth — charges, VAT, levies, payments, and outstanding balance.
          Climate Resilience Fee is a levy, not VAT.
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading folio…</p>
        ) : null}
        {!loading && !error && folios.length === 0 ? (
          <p className="text-sm text-muted-foreground">No folio yet.</p>
        ) : null}
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
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-9 text-xs">Description</TableHead>
                        <TableHead className="h-9 text-xs">Type</TableHead>
                        <TableHead className="h-9 text-right text-xs">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {folio.lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="py-2">
                            <div className="text-sm">{line.description}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {line.sourceType}
                              {line.taxSnapshot
                                ? ` · ${line.taxSnapshot.taxType}`
                                : ""}
                            </div>
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">
                            {line.lineType}
                          </TableCell>
                          <TableCell className="py-2 text-right text-sm tabular-nums">
                            {formatMoney(line.amount, line.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                    bold
                  />
                  <WorkspaceDetailRow
                    label="Paid (net settled)"
                    value={formatMoney(netSettled, folio.balance.currency)}
                  />
                  {folio.balance.allocatedPaidAmount ? (
                    <WorkspaceDetailRow
                      label="Allocated (gross)"
                      value={formatMoney(
                        folio.balance.allocatedPaidAmount,
                        folio.balance.currency,
                      )}
                    />
                  ) : null}
                  <WorkspaceDetailRow
                    label="Refunded"
                    value={formatMoney(refunded, folio.balance.currency)}
                  />
                  <WorkspaceDetailRow
                    label="Outstanding"
                    value={formatMoney(
                      folio.balance.outstandingBalance,
                      folio.balance.currency,
                    )}
                    bold
                  />
                  <WorkspaceDetailRow
                    label="Overpayment"
                    value={formatMoney(overpay, folio.balance.currency)}
                  />
                </WorkspaceDetailList>

                <div className="rounded-md border border-border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Fiscal documents
                  </p>
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
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Local issuance only — not sent to AADE. Issued documents keep
                    immutable customer/issuer snapshots.
                  </p>
                </div>
              </div>
            );
          })}
      </WorkspaceSection>
    </div>
  );
}

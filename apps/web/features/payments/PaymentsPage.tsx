"use client";

import { useCallback, useEffect, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { adminFetch } from "@/lib/admin/api";
import { formatMoney } from "@/lib/admin/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PaymentRow {
  id: string;
  amount: string;
  currency: string;
  status: string;
  method: string;
  collectionSource: string;
  propertyId: string;
  bookingId: string | null;
  payerName: string | null;
  receivedAt: string;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PaymentsPage() {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [collectionSource, setCollectionSource] = useState("PROPERTY");
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !propertyId) return;
    setLoading(true);
    try {
      const res = await adminFetch<{ payments: PaymentRow[] }>(
        `/payments?propertyId=${encodeURIComponent(propertyId)}`,
        { tenantId },
      );
      setRows(res.payments ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recordPayment() {
    if (!tenantId || !propertyId || !payAmount.trim()) return;
    setRecording(true);
    setRecordError(null);
    try {
      await adminFetch("/payments", {
        method: "POST",
        tenantId,
        body: JSON.stringify({
          amount: payAmount.trim(),
          currency: "EUR",
          method: payMethod,
          collectionSource,
          propertyId,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
      setPayAmount("");
      await load();
    } catch (err) {
      setRecordError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setRecording(false);
    }
  }

  const propertyGate = renderActivePropertyGate({
    tenantLoading,
    tenantError,
    tenantId,
    propertyReady,
    propertyError,
    propertyId,
    properties,
  });
  if (propertyGate) return propertyGate;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manual and recorded payments for {property?.name ?? "the active property"}{" "}
          (booked and unbooked).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Record payment</CardTitle>
          <CardDescription>
            Creates a payment owned by the active property. Booking linkage is optional.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recordError ? (
            <p className="text-sm text-destructive">{recordError}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="workspace-pay-amount">Amount (EUR)</Label>
              <Input
                id="workspace-pay-amount"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="workspace-pay-method">Method</Label>
              <select
                id="workspace-pay-method"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="OTA">OTA</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="workspace-pay-source">Collected by</Label>
              <select
                id="workspace-pay-source"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={collectionSource}
                onChange={(e) => setCollectionSource(e.target.value)}
              >
                <option value="PROPERTY">Property</option>
                <option value="DIRECT">Direct</option>
                <option value="OTA">OTA</option>
                <option value="PAYMENT_GATEWAY">Payment gateway</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <Button
            disabled={recording || !payAmount.trim()}
            onClick={() => void recordPayment()}
          >
            {recording ? "Recording…" : "Record payment"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>Newest first — up to 100 records for this property.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3">Received</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">Method</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Booking</th>
                    <th className="py-2">Payer</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} className="border-b border-border/60">
                      <td className="py-2 pr-3">
                        {new Date(p.receivedAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 tabular-nums font-medium">
                        {formatMoney(p.amount, p.currency)}
                      </td>
                      <td className="py-2 pr-3">{p.method}</td>
                      <td className="py-2 pr-3">{p.collectionSource}</td>
                      <td className="py-2 pr-3">{p.status}</td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {p.bookingId ?? "—"}
                      </td>
                      <td className="py-2">{p.payerName ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

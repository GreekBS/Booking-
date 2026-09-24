"use client";

import { useCallback, useEffect, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { adminFetch } from "@/lib/admin/api";
import { formatMoney } from "@/lib/admin/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PaymentRow {
  id: string;
  amount: string;
  currency: string;
  status: string;
  method: string;
  collectionSource: string;
  bookingId: string | null;
  payerName: string | null;
  receivedAt: string;
}

export function PaymentsPage() {
  const { tenantId } = useTenant();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await adminFetch<{ payments: PaymentRow[] }>("/payments", {
        tenantId,
      });
      setRows(res.payments ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manual and recorded payments for this tenant (F4 settlement).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All payments</CardTitle>
          <CardDescription>Newest first — up to 100 records.</CardDescription>
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

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { adminFetch } from "@/lib/admin/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface DocRow {
  documentNumber: string | null;
  localStatusLabel: string;
  document: {
    id: string;
    documentKind: string;
    status: string;
    issuedAt: string | null;
    currency: string;
    totals: { netTotal: string; vatTotal: string; grossTotal: string };
    customerSnapshot: { legalName: string } | null;
    sourceBookingId: string | null;
  };
}

export function FiscalDocumentsPage() {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId || !propertyId) return;
    setLoading(true);
    try {
      const res = await adminFetch<{ documents: DocRow[] }>(
        `/fiscal/documents?propertyId=${encodeURIComponent(propertyId)}`,
        { tenantId },
      );
      setRows(res.documents ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

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
        <h1 className="text-2xl font-semibold tracking-tight">Fiscal documents</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Locally issued documents for the active property. Not sent to AADE — pending
          fiscalization integration.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            Numbers, types, totals, and local status from immutable snapshots.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No fiscal documents yet. Issue from a booking folio.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Number</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Issued</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Net</th>
                    <th className="py-2 pr-3">VAT</th>
                    <th className="py-2 pr-3">Total</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2"> </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.document.id} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium">
                        {r.documentNumber ?? "DRAFT"}
                      </td>
                      <td className="py-2 pr-3">{r.document.documentKind}</td>
                      <td className="py-2 pr-3">
                        {r.document.issuedAt
                          ? new Date(r.document.issuedAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {r.document.customerSnapshot?.legalName ?? "—"}
                      </td>
                      <td className="py-2 pr-3">{r.document.totals.netTotal}</td>
                      <td className="py-2 pr-3">{r.document.totals.vatTotal}</td>
                      <td className="py-2 pr-3">
                        {r.document.totals.grossTotal} {r.document.currency}
                      </td>
                      <td className="py-2 pr-3">{r.localStatusLabel}</td>
                      <td className="py-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/fiscal-documents/${r.document.id}`}>
                            Open
                          </Link>
                        </Button>
                      </td>
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

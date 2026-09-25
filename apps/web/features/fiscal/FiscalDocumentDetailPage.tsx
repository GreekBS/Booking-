"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTenant } from "@/hooks/use-tenant";
import { adminFetch } from "@/lib/admin/api";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Detail {
  documentNumber: string | null;
  localStatusLabel: string;
  greekMapping: { myDataInvoiceType: string; labelEn: string };
  document: {
    id: string;
    status: string;
    documentKind: string;
    issuedAt: string | null;
    currency: string;
    issuerSnapshot: {
      legalName: string;
      vatNumber: string | null;
      address: { line1: string; city: string; postalCode: string };
    } | null;
    customerSnapshot: {
      legalName: string;
      vatNumber: string | null;
    } | null;
    totals: {
      netTotal: string;
      vatTotal: string;
      levyTotal: string;
      grossTotal: string;
    };
    correlation: { originalDocumentId: string; reason: string } | null;
    sourceBookingId: string | null;
  };
  lines: Array<{
    id: string;
    description: string;
    netAmount: string;
    vatAmount: string;
    levyAmount: string;
    grossAmount: string;
    sourceFolioLineId: string | null;
  }>;
}

export function FiscalDocumentDetailPage() {
  const { tenantId } = useTenant();
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !documentId) return;
    const res = await adminFetch<Detail>(`/fiscal/documents/${documentId}`, {
      tenantId,
    });
    setDetail(res);
  }, [tenantId, documentId]);

  useEffect(() => {
    void load().catch((e) =>
      toastError(e instanceof Error ? e.message : "Load failed"),
    );
  }, [load]);

  async function issue() {
    if (!tenantId || !documentId) return;
    setIssuing(true);
    try {
      const key = `issue:${documentId}:${tenantId}`;
      await adminFetch(`/fiscal/documents/${documentId}/issue`, {
        tenantId,
        method: "POST",
        body: JSON.stringify({ issuanceIdempotencyKey: key }),
      });
      toastSuccess("Issued locally");
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Issue failed");
    } finally {
      setIssuing(false);
    }
  }

  if (!detail) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const d = detail.document;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {detail.documentNumber ?? "Draft document"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {d.documentKind} · {detail.localStatusLabel}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/fiscal-documents">Back</Link>
          </Button>
          {d.status === "DRAFT" && (
            <Button onClick={() => void issue()} disabled={issuing}>
              {issuing ? "Issuing…" : "Issue locally"}
            </Button>
          )}
          {d.status === "ISSUED" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  void (async () => {
                    if (!tenantId) return;
                    const res = await fetch(
                      `/api/admin/v1/fiscal/documents/${d.id}/print`,
                      { headers: { "x-tenant-id": tenantId } },
                    );
                    const html = await res.text();
                    const w = window.open("", "_blank");
                    if (w) {
                      w.document.write(html);
                      w.document.close();
                    }
                  })();
                }}
              >
                Print view
              </Button>
              <Button
                onClick={() => {
                  void (async () => {
                    if (!tenantId) return;
                    try {
                      const res = await fetch(
                        `/api/admin/v1/fiscal/documents/${d.id}/download`,
                        { headers: { "x-tenant-id": tenantId } },
                      );
                      if (!res.ok) {
                        toastError("Download failed");
                        return;
                      }
                      const blob = await res.blob();
                      const cd = res.headers.get("content-disposition") ?? "";
                      const match = /filename="([^"]+)"/.exec(cd);
                      const filename = match?.[1] ?? "fiscal-document.pdf";
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = filename;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch (e) {
                      toastError(e instanceof Error ? e.message : "Download failed");
                    }
                  })();
                }}
              >
                Download PDF
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Issuer snapshot</CardTitle>
            <CardDescription>Frozen at draft/issue — not live profile.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>{d.issuerSnapshot?.legalName}</div>
            <div>AFM: {d.issuerSnapshot?.vatNumber ?? "—"}</div>
            <div>
              {d.issuerSnapshot?.address.line1}, {d.issuerSnapshot?.address.city}{" "}
              {d.issuerSnapshot?.address.postalCode}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recipient snapshot</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>{d.customerSnapshot?.legalName ?? "—"}</div>
            <div>AFM: {d.customerSnapshot?.vatNumber ?? "—"}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Description</th>
                <th className="py-2">Net</th>
                <th className="py-2">VAT</th>
                <th className="py-2">Levy</th>
                <th className="py-2">Gross</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((l) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="py-2 pr-2">{l.description}</td>
                  <td className="py-2">{l.netAmount}</td>
                  <td className="py-2">{l.vatAmount}</td>
                  <td className="py-2">{l.levyAmount}</td>
                  <td className="py-2">{l.grossAmount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 text-sm space-y-1 text-right">
            <div>Net: {d.totals.netTotal}</div>
            <div>VAT: {d.totals.vatTotal}</div>
            <div>Levy: {d.totals.levyTotal}</div>
            <div className="font-semibold">
              Gross: {d.totals.grossTotal} {d.currency}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provenance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>Booking: {d.sourceBookingId ?? "—"}</div>
          {d.correlation && (
            <div>
              Credit of {d.correlation.originalDocumentId}: {d.correlation.reason}
            </div>
          )}
          <div>
            Greek mapping (config only): {detail.greekMapping.myDataInvoiceType}{" "}
            {detail.greekMapping.labelEn}
          </div>
          <div className="text-muted-foreground pt-2">
            Issued locally — pending fiscalization integration. No AADE/MARK.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

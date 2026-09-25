"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTenant } from "@/hooks/use-tenant";
import { adminFetch } from "@/lib/admin/api";
import {
  fiscalDocumentKindLabel,
  formatOperatorDate,
  formatOperatorMoney,
  moneyCellClassName,
} from "@/lib/admin/money-presentation";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

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

async function downloadFiscalPdf(tenantId: string, documentId: string): Promise<void> {
  const res = await fetch(`/api/admin/v1/fiscal/documents/${documentId}/download`, {
    headers: { "x-tenant-id": tenantId },
  });
  if (!res.ok) {
    throw new Error("Download failed");
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
}

export function FiscalDocumentDetailPage() {
  const { tenantId } = useTenant();
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !documentId) return;
    setLoadError(null);
    const res = await adminFetch<Detail>(`/fiscal/documents/${documentId}`, {
      tenantId,
    });
    setDetail(res);
  }, [tenantId, documentId]);

  useEffect(() => {
    void load().catch((e) => {
      const msg = e instanceof Error ? e.message : "Load failed";
      setLoadError(msg);
      toastError(msg);
    });
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

  if (loadError && !detail) {
    return (
      <div>
        <PageHeader title="Fiscal document" />
        <ErrorState message={loadError} onRetry={() => void load()} />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const d = detail.document;
  const currency = d.currency;
  const isIssued = d.status === "ISSUED";
  const isDraft = d.status === "DRAFT";

  return (
    <div>
      <PageHeader
        title={detail.documentNumber ?? "Draft document"}
        description={`${fiscalDocumentKindLabel(d.documentKind)} · immutable snapshots`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={d.status}
              label={isIssued ? "Issued" : isDraft ? "Draft" : detail.localStatusLabel}
            />
            <span className="text-xs text-muted-foreground">
              {isIssued
                ? `Issued ${formatOperatorDate(d.issuedAt)}`
                : "Not issued — values still draft"}
            </span>
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/fiscal-documents">Back</Link>
            </Button>
            {isDraft ? (
              <Button onClick={() => void issue()} disabled={issuing}>
                {issuing ? "Issuing…" : "Issue locally"}
              </Button>
            ) : null}
            {isIssued && tenantId ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    void (async () => {
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
                    void downloadFiscalPdf(tenantId, d.id).catch((e) =>
                      toastError(e instanceof Error ? e.message : "Download failed"),
                    );
                  }}
                >
                  Download PDF
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <Surface variant="subtle" className="mb-5" padding="sm">
        <p className="text-xs text-muted-foreground">
          Issued documents are immutable. Corrections use cancellation, credit, or reissue where
          the domain supports them. No AADE / MARK transmission in this phase.
        </p>
      </Surface>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Surface>
          <SurfaceHeader
            title="Issuer snapshot"
            description="Frozen at draft/issue — not the live business profile."
          />
          <div className="space-y-1 text-sm">
            <p className="font-medium">{d.issuerSnapshot?.legalName ?? "—"}</p>
            <p className="text-muted-foreground">
              AFM: {d.issuerSnapshot?.vatNumber ?? "—"}
            </p>
            {d.issuerSnapshot?.address ? (
              <p className="text-muted-foreground">
                {d.issuerSnapshot.address.line1}, {d.issuerSnapshot.address.city}{" "}
                {d.issuerSnapshot.address.postalCode}
              </p>
            ) : null}
          </div>
        </Surface>
        <Surface>
          <SurfaceHeader
            title="Customer snapshot"
            description="Frozen billing party — not a live CustomerBillingProfile re-read."
          />
          <div className="space-y-1 text-sm">
            <p className="font-medium">{d.customerSnapshot?.legalName ?? "—"}</p>
            <p className="text-muted-foreground">
              AFM: {d.customerSnapshot?.vatNumber ?? "—"}
            </p>
          </div>
        </Surface>
      </div>

      <Surface padding="none" className="mb-5">
        <div className="border-b border-border px-4 py-3">
          <SurfaceHeader
            className="mb-0"
            title="Fiscal lines"
            description="Stored line amounts. Levy / Climate Resilience Fee is separate from VAT."
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead className="text-right">Levy / CRF</TableHead>
              <TableHead className="text-right">Gross</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {detail.lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="max-w-[240px] text-sm">{l.description}</TableCell>
                <TableCell className={moneyCellClassName("text-xs")}>
                  {formatOperatorMoney(l.netAmount, currency)}
                </TableCell>
                <TableCell className={moneyCellClassName("text-xs")}>
                  {formatOperatorMoney(l.vatAmount, currency)}
                </TableCell>
                <TableCell className={moneyCellClassName("text-xs")}>
                  {formatOperatorMoney(l.levyAmount, currency)}
                </TableCell>
                <TableCell className={moneyCellClassName("text-sm")}>
                  {formatOperatorMoney(l.grossAmount, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface>
          <SurfaceHeader title="Tax summary" description="From stored document totals." />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Net</dt>
              <dd className="tabular-nums font-medium">
                {formatOperatorMoney(d.totals.netTotal, currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">VAT</dt>
              <dd className="tabular-nums font-medium">
                {formatOperatorMoney(d.totals.vatTotal, currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                Climate Resilience Fee / levy
                <span className="block text-[10px] font-normal">(not VAT)</span>
              </dt>
              <dd className="tabular-nums font-medium">
                {formatOperatorMoney(d.totals.levyTotal, currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-2">
              <dt className="font-semibold">Gross</dt>
              <dd className="text-base font-semibold tabular-nums">
                {formatOperatorMoney(d.totals.grossTotal, currency)}
              </dd>
            </div>
          </dl>
        </Surface>

        <Surface>
          <SurfaceHeader title="Provenance" />
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Booking: </span>
              {d.sourceBookingId ? (
                <Link
                  href={`/dashboard/bookings?bookingId=${d.sourceBookingId}`}
                  className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                >
                  {d.sourceBookingId}
                </Link>
              ) : (
                "—"
              )}
            </p>
            {d.correlation ? (
              <p>
                <span className="text-muted-foreground">Credit of </span>
                <span className="font-mono text-xs">{d.correlation.originalDocumentId}</span>
                {": "}
                {d.correlation.reason}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Greek mapping (config only): {detail.greekMapping.myDataInvoiceType} —{" "}
              {detail.greekMapping.labelEn}
            </p>
            <p className="pt-1 text-xs text-muted-foreground">
              Issued locally — pending fiscalization integration. No AADE/MARK.
            </p>
          </div>
        </Surface>
      </div>
    </div>
  );
}

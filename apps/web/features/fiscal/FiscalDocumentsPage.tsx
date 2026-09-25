"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { adminFetch } from "@/lib/admin/api";
import {
  fiscalDocumentKindLabel,
  formatOperatorDate,
  formatOperatorMoney,
  moneyCellClassName,
} from "@/lib/admin/money-presentation";
import { toastError } from "@/lib/admin/toast";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
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

interface DocRow {
  documentNumber: string | null;
  localStatusLabel: string;
  document: {
    id: string;
    documentKind: string;
    status: string;
    issuedAt: string | null;
    currency: string;
    totals: {
      netTotal: string;
      vatTotal: string;
      levyTotal?: string;
      grossTotal: string;
    };
    customerSnapshot: { legalName: string } | null;
    sourceBookingId: string | null;
  };
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

export function FiscalDocumentsPage() {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !propertyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminFetch<{ documents: DocRow[] }>(
        `/fiscal/documents?propertyId=${encodeURIComponent(propertyId)}`,
        { tenantId },
      );
      setRows(res.documents ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load fiscal documents");
      setRows([]);
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
    <div>
      <PageHeader
        title="Fiscal documents"
        description="Locally issued fiscal documents for the active property. Distinct from payments and folio charges. Not transmitted to AADE."
        meta={
          property?.name ? (
            <span className="text-xs text-muted-foreground">
              Active property · <span className="font-medium text-foreground">{property.name}</span>
            </span>
          ) : null
        }
      />

      <Surface variant="subtle" className="mb-5" padding="sm">
        <p className="text-xs text-muted-foreground">
          Documents use immutable issuer/customer snapshots. Climate Resilience Fee (levy) is not
          VAT. Provider fiscalization (AADE / myDATA) is not implemented yet.
        </p>
      </Surface>

      <Surface padding="none">
        <div className="border-b border-border px-4 py-3">
          <SurfaceHeader
            className="mb-0"
            title="Document ledger"
            description="Issue from a booking folio. Open a document for lines, tax summary, and PDF."
          />
        </div>

        {loadError ? (
          <div className="p-4">
            <ErrorState message={loadError} onRetry={() => void load()} />
          </div>
        ) : loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              title="No fiscal documents"
              description="Issue a document from a booking folio when settlement is ready."
              action={{ label: "Go to bookings", href: "/dashboard/bookings", onClick: () => {} }}
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Issue date</TableHead>
                    <TableHead className="hidden lg:table-cell">Customer</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">Net</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">VAT</TableHead>
                    <TableHead className="hidden xl:table-cell text-right">Levy</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const d = r.document;
                    const currency = d.currency;
                    const levy = d.totals.levyTotal;
                    return (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">
                          {r.documentNumber ?? "DRAFT"}
                        </TableCell>
                        <TableCell className="max-w-[160px] text-xs">
                          {fiscalDocumentKindLabel(d.documentKind)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatOperatorDate(d.issuedAt)}
                        </TableCell>
                        <TableCell className="hidden max-w-[160px] truncate text-xs lg:table-cell">
                          {d.customerSnapshot?.legalName ?? "—"}
                        </TableCell>
                        <TableCell className={moneyCellClassName("hidden text-xs xl:table-cell")}>
                          {formatOperatorMoney(d.totals.netTotal, currency)}
                        </TableCell>
                        <TableCell className={moneyCellClassName("hidden text-xs xl:table-cell")}>
                          {formatOperatorMoney(d.totals.vatTotal, currency)}
                        </TableCell>
                        <TableCell className={moneyCellClassName("hidden text-xs xl:table-cell")}>
                          {levy != null ? formatOperatorMoney(levy, currency) : "—"}
                        </TableCell>
                        <TableCell className={moneyCellClassName("text-sm")}>
                          {formatOperatorMoney(d.totals.grossTotal, currency)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={d.status}
                            label={d.status === "ISSUED" ? "Issued" : d.status === "DRAFT" ? "Draft" : r.localStatusLabel}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/dashboard/fiscal-documents/${d.id}`}>Open</Link>
                            </Button>
                            {d.status === "ISSUED" && tenantId ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  void downloadFiscalPdf(tenantId, d.id).catch((e) =>
                                    toastError(e instanceof Error ? e.message : "Download failed"),
                                  );
                                }}
                              >
                                PDF
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y divide-border md:hidden">
              {rows.map((r) => {
                const d = r.document;
                return (
                  <li key={d.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {r.documentNumber ?? "DRAFT"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {fiscalDocumentKindLabel(d.documentKind)} ·{" "}
                          {formatOperatorDate(d.issuedAt)}
                        </p>
                        <p className="mt-1 text-sm font-medium tabular-nums">
                          {formatOperatorMoney(d.totals.grossTotal, d.currency)}
                        </p>
                      </div>
                      <StatusBadge
                        status={d.status}
                        label={d.status === "ISSUED" ? "Issued" : "Draft"}
                      />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/fiscal-documents/${d.id}`}>Open</Link>
                      </Button>
                      {d.status === "ISSUED" && tenantId ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            void downloadFiscalPdf(tenantId, d.id).catch((e) =>
                              toastError(e instanceof Error ? e.message : "Download failed"),
                            );
                          }}
                        >
                          PDF
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Surface>
    </div>
  );
}

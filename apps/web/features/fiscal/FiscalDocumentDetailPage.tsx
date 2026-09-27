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
import { elCommon, statusLabelEl } from "@/lib/i18n";

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
    throw new Error("Η λήψη απέτυχε");
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
      const msg = e instanceof Error ? e.message : "Αποτυχία φόρτωσης";
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
      toastSuccess("Εκδόθηκε τοπικά");
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Αποτυχία έκδοσης");
    } finally {
      setIssuing(false);
    }
  }

  if (loadError && !detail) {
    return (
      <div>
        <PageHeader title="Παραστατικό" />
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
        title={detail.documentNumber ?? "Πρόχειρο παραστατικό"}
        description={`${fiscalDocumentKindLabel(d.documentKind)} · αμετάβλητα στιγμιότυπα`}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={d.status}
              label={
                isIssued
                  ? statusLabelEl("ISSUED")
                  : isDraft
                    ? statusLabelEl("DRAFT")
                    : detail.localStatusLabel
              }
            />
            <span className="text-xs text-muted-foreground">
              {isIssued
                ? `Εκδόθηκε ${formatOperatorDate(d.issuedAt)}`
                : "Δεν έχει εκδοθεί — οι τιμές είναι ακόμα πρόχειρες"}
            </span>
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/fiscal-documents">{elCommon.back}</Link>
            </Button>
            {isDraft ? (
              <Button onClick={() => void issue()} disabled={issuing}>
                {issuing ? "Έκδοση…" : "Τοπική έκδοση"}
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
                  Προβολή εκτύπωσης
                </Button>
                <Button
                  onClick={() => {
                    void downloadFiscalPdf(tenantId, d.id).catch((e) =>
                      toastError(e instanceof Error ? e.message : "Η λήψη απέτυχε"),
                    );
                  }}
                >
                  {elCommon.download} PDF
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <Surface variant="subtle" className="mb-5" padding="sm">
        <p className="text-xs text-muted-foreground">
          Τα εκδοθέντα παραστατικά είναι αμετάβλητα. Διορθώσεις μέσω ακύρωσης, πιστωτικού ή
          επανέκδοσης όπου το υποστηρίζει το σύστημα. Δεν υπάρχει αποστολή AADE / MARK σε αυτή τη φάση.
        </p>
      </Surface>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Surface>
          <SurfaceHeader
            title="Στιγμιότυπο εκδότη"
            description="Κατάσταση κατά πρόχειρο/έκδοση — όχι live προφίλ."
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
            title="Στιγμιότυπο πελάτη"
            description="Κατάσταση χρεώσης — όχι live ανάγνωση προφίλ."
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
            title="Γραμμές παραστατικού"
            description="Αποθηκευμένα ποσά. Εισφορά κλιματικής ανθεκτικότητας ξεχωριστά από ΦΠΑ."
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Περιγραφή</TableHead>
              <TableHead className="text-right">Καθαρή αξία</TableHead>
              <TableHead className="text-right">ΦΠΑ</TableHead>
              <TableHead className="text-right">Τέλος / CRF</TableHead>
              <TableHead className="text-right">Μικτά</TableHead>
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
          <SurfaceHeader title="Φορολογική σύνοψη" description="Από αποθηκευμένα σύνολα παραστατικού." />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Καθαρή αξία</dt>
              <dd className="tabular-nums font-medium">
                {formatOperatorMoney(d.totals.netTotal, currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">ΦΠΑ</dt>
              <dd className="tabular-nums font-medium">
                {formatOperatorMoney(d.totals.vatTotal, currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                Τέλος κλιματικής ανθεκτικότητας
                <span className="block text-[10px] font-normal">(όχι ΦΠΑ)</span>
              </dt>
              <dd className="tabular-nums font-medium">
                {formatOperatorMoney(d.totals.levyTotal, currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-border pt-2">
              <dt className="font-semibold">Μικτά</dt>
              <dd className="text-base font-semibold tabular-nums">
                {formatOperatorMoney(d.totals.grossTotal, currency)}
              </dd>
            </div>
          </dl>
        </Surface>

        <Surface>
          <SurfaceHeader title="Προέλευση" />
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Κράτηση: </span>
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
                <span className="text-muted-foreground">Πιστωτικό για </span>
                <span className="font-mono text-xs">{d.correlation.originalDocumentId}</span>
                {": "}
                {d.correlation.reason}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Ελληνική αντιστοίχιση (μόνο ρύθμιση): {detail.greekMapping.myDataInvoiceType} —{" "}
              {detail.greekMapping.labelEn}
            </p>
            <p className="pt-1 text-xs text-muted-foreground">
              Τοπική έκδοση — εκκρεμεί ενσωμάτωση φορολογικής υποβολής. Χωρίς AADE/MARK.
            </p>
          </div>
        </Surface>
      </div>
    </div>
  );
}

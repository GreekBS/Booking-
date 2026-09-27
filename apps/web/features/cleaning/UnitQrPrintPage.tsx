"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTenant } from "@/hooks/use-tenant";
import { generateUnitQr, rotateUnitQr } from "@/lib/admin/api";
import type { UnitQrRecord } from "@/lib/admin/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/error-state";
import { buildQrScanUrl } from "./UnitQrSheet";

/**
 * Εκτύπωση-friendly sticker for a unit QR code.
 *
 * On open it asks the API to mint a code. If one is already active the token
 * cannot be recovered (hash-only storage), so the page offers an explicit
 * rotate-and-print instead of silently replacing a live sticker.
 */
export function UnitQrPrintPage({ unitId }: { unitId: string }) {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [record, setRecord] = useState<UnitQrRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ensure = useCallback(async () => {
    if (!tenantId) return;
    try {
      setRecord(await generateUnitQr(tenantId, unitId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία προετοιμασίας κωδικού QR");
    }
  }, [tenantId, unitId]);

  useEffect(() => {
    void ensure();
  }, [ensure]);

  async function handleRotate() {
    if (!tenantId || busy) return;
    setBusy(true);
    try {
      setRecord(await rotateUnitQr(tenantId, unitId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία αντικατάστασης κωδικού QR");
    } finally {
      setBusy(false);
    }
  }

  if (tenantLoading) return <Skeleton className="m-8 h-96" />;
  if (tenantError) return <ErrorState message={tenantError} />;
  if (error) return <ErrorState message={error} onRetry={() => void ensure()} />;
  if (!record) return <Skeleton className="m-8 h-96" />;

  const token = record.token;

  return (
    <div className="mx-auto max-w-2xl p-8 print:p-0">
      <style>{`
        @media print {
          .qr-print-hide { display: none !important; }
          @page { margin: 16mm; }
        }
      `}</style>

      <div className="qr-print-hide mb-6 flex flex-wrap gap-2">
        <Button onClick={() => window.print()} disabled={!token}>
          Εκτύπωση
        </Button>
        <Button variant="outline" onClick={() => void handleRotate()} disabled={busy}>
          Αντικατάσταση &amp; εκτύπωση νέου
        </Button>
      </div>

      {!token ? (
        <div className="rounded-lg border bg-muted/40 p-6">
          <p className="font-medium">Η μονάδα έχει ήδη ενεργό κωδικό QR</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Οι κωδικοί αποθηκεύονται ως μονόδρομα hash και δεν επανεκτυπώνονται. Χρησιμοποιήστε
            «Αντικατάσταση &amp; εκτύπωση νέου» για αντικατάσταση — το
            υπάρχον αυτοκόλλητο σταματά αμέσως.
          </p>
        </div>
      ) : (
        <article className="rounded-2xl border-2 border-black p-10 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-neutral-600">
            {record.propertyName}
          </p>
          <h1 className="mt-2 text-4xl font-bold">{record.unitName}</h1>
          <p className="mt-1 text-lg font-medium text-neutral-700">
            Σαρώστε για έναρξη καθαρισμού
          </p>

          <div className="my-8 flex justify-center">
            <QRCodeSVG value={buildQrScanUrl(token)} size={280} level="M" />
          </div>

          <p className="break-all font-mono text-xs text-neutral-500">
            {buildQrScanUrl(token)}
          </p>
          <p className="mt-6 text-sm text-neutral-600">
            Συνδεθείτε με λογαριασμό Talos για να καταγράψετε τον καθαρισμό.
          </p>
        </article>
      )}
    </div>
  );
}

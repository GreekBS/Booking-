"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useTenant } from "@/hooks/use-tenant";
import { fetchUnitQr, generateUnitQr, rotateUnitQr } from "@/lib/admin/api";
import type { UnitQrRecord } from "@/lib/admin/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/error-state";
import { buildQrScanUrl } from "./UnitQrSheet";

/**
 * Εκτύπωση-friendly sticker for a unit QR code.
 * Loads existing recoverable QR via GET — does not mint/rotate on open when ACTIVE.
 */
export function UnitQrPrintPage({ unitId }: { unitId: string }) {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [record, setRecord] = useState<UnitQrRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      let next = await fetchUnitQr(tenantId, unitId);
      if (next.status !== "ACTIVE") {
        next = await generateUnitQr(tenantId, unitId);
      }
      setRecord(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία προετοιμασίας κωδικού QR");
    }
  }, [tenantId, unitId]);

  useEffect(() => {
    void load();
  }, [load]);

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
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!record) return <Skeleton className="m-8 h-96" />;

  const token = record.token;
  const legacyActive = record.status === "ACTIVE" && !record.recoverable && !token;

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

      {token ? (
        <article className="rounded-2xl border-2 border-black p-10 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-neutral-600">
            {record.propertyName}
          </p>
          <h1 className="mt-2 text-4xl font-bold">{record.unitName}</h1>
          <p className="mt-1 text-lg font-medium text-neutral-700">
            Σαρώστε για πρόσβαση στην καθαριότητα
          </p>

          <div className="my-8 flex justify-center">
            <QRCodeSVG value={buildQrScanUrl(token)} size={280} level="M" />
          </div>

          <p className="mt-6 text-sm text-neutral-600">
            Συνδεθείτε με λογαριασμό Talos για να καταγράψετε τον καθαρισμό.
          </p>
        </article>
      ) : legacyActive ? (
        <div className="rounded-lg border bg-muted/40 p-6">
          <p className="font-medium">Ενεργός κωδικός χωρίς μόνιμη προβολή</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Ο υπάρχων κωδικός QR παραμένει ενεργός, αλλά δημιουργήθηκε πριν
            ενεργοποιηθεί η μόνιμη προβολή. Αντικαταστήστε τον μία φορά για να
            εμφανίζεται και να εκτυπώνεται από εδώ.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/40 p-6">
          <p className="font-medium">Δεν υπάρχει ενεργός κωδικός QR</p>
        </div>
      )}
    </div>
  );
}

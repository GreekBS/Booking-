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
 * Print-friendly sticker for a unit QR code.
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
      setError(err instanceof Error ? err.message : "Failed to prepare QR code");
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
      setError(err instanceof Error ? err.message : "Failed to rotate QR code");
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
          Print
        </Button>
        <Button variant="outline" onClick={() => void handleRotate()} disabled={busy}>
          Rotate &amp; print new code
        </Button>
      </div>

      {!token ? (
        <div className="rounded-lg border bg-muted/40 p-6">
          <p className="font-medium">This unit already has an active QR code</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Codes are stored as one-way hashes and cannot be reprinted. Use
            &ldquo;Rotate &amp; print new code&rdquo; to issue a replacement — the
            existing sticker stops working the moment you do.
          </p>
        </div>
      ) : (
        <article className="rounded-2xl border-2 border-black p-10 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-neutral-600">
            {record.propertyName}
          </p>
          <h1 className="mt-2 text-4xl font-bold">{record.unitName}</h1>
          <p className="mt-1 text-lg font-medium text-neutral-700">
            Scan to start cleaning
          </p>

          <div className="my-8 flex justify-center">
            <QRCodeSVG value={buildQrScanUrl(token)} size={280} level="M" />
          </div>

          <p className="break-all font-mono text-xs text-neutral-500">
            {buildQrScanUrl(token)}
          </p>
          <p className="mt-6 text-sm text-neutral-600">
            Sign in with your Talos account to record the cleaning.
          </p>
        </article>
      )}
    </div>
  );
}

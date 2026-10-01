"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Printer, RefreshCw } from "lucide-react";
import {
  fetchUnitQr,
  generateUnitQr,
  rotateUnitQr,
} from "@/lib/admin/api";
import type { UnitQrRecord } from "@/lib/admin/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { displayUnitName } from "@/lib/i18n";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { toastError, toastSuccess } from "@/lib/admin/toast";

export function buildQrScanUrl(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/q/${token}`;
}

type UnitQrSheetProps = {
  tenantId: string;
  unit: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Δημιουργία / view / print / rotate the unit QR code.
 * Recoverable ACTIVE codes are re-displayed after refresh via sealed storage.
 */
export function UnitQrSheet({ tenantId, unit, onOpenChange }: UnitQrSheetProps) {
  const [record, setRecord] = useState<UnitQrRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const load = useCallback(async () => {
    if (!unit) return;
    setLoading(true);
    try {
      setRecord(await fetchUnitQr(tenantId, unit.id));
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης κωδικού QR");
    } finally {
      setLoading(false);
    }
  }, [tenantId, unit]);

  useEffect(() => {
    setRecord(null);
    void load();
  }, [load]);

  async function handleGenerate() {
    if (!unit || busy) return;
    setBusy(true);
    try {
      const next = await generateUnitQr(tenantId, unit.id);
      setRecord(next);
      toastSuccess(next.token ? "Δημιουργήθηκε κωδικός QR" : "Υπάρχει ήδη ενεργός κωδικός");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία δημιουργίας κωδικού QR");
    } finally {
      setBusy(false);
    }
  }

  async function handleRotate() {
    if (!unit || busy) return;
    setBusy(true);
    setConfirmRotate(false);
    try {
      const next = await rotateUnitQr(tenantId, unit.id);
      setRecord(next);
      toastSuccess("Αντικαταστάθηκε ο κωδικός QR — εκτυπώστε και αντικαταστήστε το αυτοκόλλητο");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία αντικατάστασης κωδικού QR");
    } finally {
      setBusy(false);
    }
  }

  const hasActive = record?.status === "ACTIVE";
  const token = record?.token ?? null;

  return (
    <>
      <Sheet open={Boolean(unit)} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>QR καθαρισμού · {displayUnitName(unit?.name)}</SheetTitle>
          </SheetHeader>

          {loading ? (
            <Skeleton className="mt-6 h-64 w-full" />
          ) : (
            <div className="mt-6 space-y-4">
              {token ? (
                <div className="space-y-3">
                  <div className="flex justify-center rounded-lg border bg-white p-4">
                    <QRCodeSVG value={buildQrScanUrl(token)} size={196} level="M" />
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    Σαρώστε για πρόσβαση στην καθαριότητα
                  </p>
                </div>
              ) : hasActive ? (
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <p className="font-medium">Ενεργός κωδικός χωρίς μόνιμη προβολή</p>
                  <p className="mt-1 text-muted-foreground">
                    Ο υπάρχων κωδικός QR παραμένει ενεργός, αλλά δημιουργήθηκε πριν
                    ενεργοποιηθεί η μόνιμη προβολή. Αντικαταστήστε τον μία φορά για να
                    εμφανίζεται και να εκτυπώνεται από εδώ.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <p className="font-medium">Δεν υπάρχει ακόμα κωδικός QR</p>
                  <p className="mt-1 text-muted-foreground">
                    Δημιουργήστε κωδικό, εκτυπώστε και τοποθετήστε τον μέσα στη μονάδα.
                  </p>
                </div>
              )}

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Κατάσταση</dt>
                  <dd>{record?.status ?? "NONE"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Δημιουργήθηκε</dt>
                  <dd>
                    {record?.createdAt
                      ? new Date(record.createdAt).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Τελευταία αντικατάσταση</dt>
                  <dd>
                    {record?.rotatedAt
                      ? new Date(record.rotatedAt).toLocaleString()
                      : "—"}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2">
                {!hasActive ? (
                  <Button size="sm" disabled={busy} onClick={() => void handleGenerate()}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Δημιουργία
                  </Button>
                ) : null}
                {unit ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/dashboard/units/qr/${unit.id}/print`} target="_blank">
                      <Printer className="h-4 w-4" />
                      Εκτύπωση
                    </Link>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirmRotate(true)}
                >
                  <RefreshCw className="h-4 w-4" />
                  Αντικατάσταση
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        title="Αντικατάσταση κωδικού QR"
        description="Το τρέχον αυτοκόλλητο σταματά αμέσως. Εκτυπώστε και τοποθετήστε τον νέο κωδικό πριν τον επόμενο καθαρισμό."
        confirmLabel="Αντικατάσταση"
        destructive
        onConfirm={() => void handleRotate()}
      />
    </>
  );
}

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
 * Generate / view / print / rotate the unit QR code.
 *
 * Only the token hash is stored, so an existing code can never be re-displayed.
 * Viewing an already-active code therefore shows metadata plus a Rotate action.
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
      toastError(err instanceof Error ? err.message : "Failed to load QR code");
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
      toastSuccess(next.token ? "QR code generated" : "A code is already active");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to generate QR code");
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
      toastSuccess("QR code rotated — reprint and replace the sticker");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to rotate QR code");
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
            <SheetTitle>Cleaning QR · {unit?.name ?? ""}</SheetTitle>
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
                  <p className="break-all rounded bg-muted p-2 font-mono text-xs">
                    {buildQrScanUrl(token)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Print this now — the code is stored as a one-way hash and cannot
                    be shown again.
                  </p>
                </div>
              ) : hasActive ? (
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <p className="font-medium">A QR code is already active</p>
                  <p className="mt-1 text-muted-foreground">
                    Codes are stored hashed, so this one cannot be displayed again.
                    Rotate to print a replacement; the old sticker stops working.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <p className="font-medium">No QR code yet</p>
                  <p className="mt-1 text-muted-foreground">
                    Generate a code, then print and attach it inside the unit.
                  </p>
                </div>
              )}

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{record?.status ?? "NONE"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>
                    {record?.createdAt
                      ? new Date(record.createdAt).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Last rotated</dt>
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
                    Generate
                  </Button>
                ) : null}
                {unit ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/dashboard/units/qr/${unit.id}/print`} target="_blank">
                      <Printer className="h-4 w-4" />
                      Print
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
                  Rotate
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        title="Rotate QR code"
        description="The current sticker stops working immediately. Print and attach the new code before the next cleaning."
        confirmLabel="Rotate"
        destructive
        onConfirm={() => void handleRotate()}
      />
    </>
  );
}

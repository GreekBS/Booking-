"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  ChevronDown,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
} from "lucide-react";
import {
  addCleaningLocation,
  archiveCleaningLocation,
  bulkInitializeCleaningLocations,
  fetchCleaningLocationQr,
  fetchCleaningLocationsBoard,
  generateCleaningLocationQr,
  renameCleaningLocation,
  rotateCleaningLocationQr,
} from "@/lib/admin/api";
import type {
  CleaningLocationBoardRow,
  CleaningLocationQrRecord,
} from "@/lib/admin/types";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { StatusBadge } from "@/components/admin/status-badge";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { cn } from "@/lib/utils";
import { buildQrScanUrl } from "@/features/cleaning/UnitQrSheet";

type PropertyTypeValue = "villa" | "apartment" | "hotel" | "other" | string;

type CleaningLocationsPanelProps = {
  tenantId: string;
  propertyId: string;
  /** Authoritative Active Property.type */
  propertyType: PropertyTypeValue;
  propertyName: string;
};

function readinessLabel(status: string): string {
  return status === "DIRTY" ? "Βρώμικο" : "Καθαρό";
}

function formatWhen(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("el-GR");
}

function isHotelType(type: PropertyTypeValue): boolean {
  return type === "hotel";
}

export function CleaningLocationsPanel({
  tenantId,
  propertyId,
  propertyType,
  propertyName,
}: CleaningLocationsPanelProps) {
  const hotelMode = isHotelType(propertyType);
  const [rows, setRows] = useState<CleaningLocationBoardRow[] | null>(null);
  const [requiresManualResolution, setRequiresManualResolution] =
    useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [qrByLocation, setQrByLocation] = useState<
    Record<string, CleaningLocationQrRecord>
  >({});
  const [qrLoadingId, setQrLoadingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [bulkCount, setBulkCount] = useState("30");
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [rotateId, setRotateId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchCleaningLocationsBoard(tenantId, propertyId);
      setRows(next.data);
      setRequiresManualResolution(next.requiresManualResolution);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : hotelMode
            ? "Αποτυχία φόρτωσης δωματίων"
            : "Αποτυχία φόρτωσης χώρου καθαρισμού",
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId, hotelMode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function ensureQr(locationId: string, mintIfMissing: boolean) {
    setQrLoadingId(locationId);
    try {
      const record = mintIfMissing
        ? await generateCleaningLocationQr(tenantId, locationId)
        : await fetchCleaningLocationQr(tenantId, locationId);
      setQrByLocation((prev) => ({ ...prev, [locationId]: record }));
      return record;
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης QR");
      return null;
    } finally {
      setQrLoadingId(null);
    }
  }

  async function handleExpand(locationId: string) {
    const next = expandedId === locationId ? null : locationId;
    setExpandedId(next);
    if (next && !qrByLocation[next]) {
      await ensureQr(next, false);
    }
  }

  async function handleBulkCreate() {
    const count = Number(bulkCount);
    if (!Number.isInteger(count) || count < 1 || count > 300) {
      toastError("Δώστε αριθμό δωματίων από 1 έως 300");
      return;
    }
    setBusy(true);
    try {
      await bulkInitializeCleaningLocations(tenantId, propertyId, count);
      toastSuccess("Δημιουργήθηκαν τα δωμάτια");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία δημιουργίας");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    const name = addName.trim();
    if (!name) {
      toastError("Το όνομα είναι υποχρεωτικό");
      return;
    }
    setBusy(true);
    try {
      await addCleaningLocation(tenantId, propertyId, name);
      toastSuccess("Προστέθηκε δωμάτιο");
      setAddOpen(false);
      setAddName("");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία προσθήκης");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    if (!renameId) return;
    const name = renameName.trim();
    if (!name) {
      toastError("Το όνομα είναι υποχρεωτικό");
      return;
    }
    setBusy(true);
    try {
      await renameCleaningLocation(tenantId, renameId, name);
      toastSuccess(hotelMode ? "Μετονομάστηκε το δωμάτιο" : "Μετονομάστηκε");
      setRenameId(null);
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία μετονομασίας");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!archiveId) return;
    setBusy(true);
    try {
      await archiveCleaningLocation(tenantId, archiveId);
      toastSuccess(
        hotelMode ? "Αρχειοθετήθηκε το δωμάτιο" : "Αρχειοθετήθηκε ο χώρος",
      );
      setArchiveId(null);
      if (expandedId === archiveId) setExpandedId(null);
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία αρχειοθέτησης");
    } finally {
      setBusy(false);
    }
  }

  async function handleRotate() {
    if (!rotateId) return;
    setBusy(true);
    setRotateId(null);
    try {
      const next = await rotateCleaningLocationQr(tenantId, rotateId);
      setQrByLocation((prev) => ({ ...prev, [rotateId]: next }));
      toastSuccess(
        "Αντικαταστάθηκε ο κωδικός QR — εκτυπώστε και αντικαταστήστε το αυτοκόλλητο",
      );
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία αντικατάστασης QR");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !rows) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (error) {
    return (
      <Surface variant="panel" className="p-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>
          Επανάληψη
        </Button>
      </Surface>
    );
  }

  const list = rows ?? [];
  const showHotelSetup = hotelMode && list.length === 0;
  const showAddRoom = hotelMode && list.length > 0;
  const sectionTitle = hotelMode ? "Δωμάτια" : "Καθαρισμός καταλύματος";
  const sectionDescription = hotelMode
    ? "Χώροι καθαρισμού με QR — ανεξάρτητα από εμπορικές μονάδες"
    : "Ένας χώρος καθαρισμού για ολόκληρο το κατάλυμα — QR και ιστορικό";

  return (
    <>
      <Surface variant="panel">
        <SurfaceHeader
          title={sectionTitle}
          description={sectionDescription}
          action={
            showAddRoom ? (
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" />
                Προσθήκη δωματίου
              </Button>
            ) : null
          }
        />

        {requiresManualResolution ? (
          <div
            role="status"
            className="mx-3 mb-2 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning-foreground sm:mx-4"
          >
            Το κατάλυμα δεν είναι πλέον ξενοδοχείο, αλλά υπάρχουν πολλαπλοί χώροι
            καθαρισμού. Το ιστορικό διατηρείται. Αρχειοθετήστε τους επιπλέον χώρους
            μέχρι να μείνει ένας — δεν δημιουργούνται νέοι χώροι αυτόματα.
          </div>
        ) : null}

        {showHotelSetup ? (
          <div className="space-y-4 p-4">
            <EmptyState
              title="Ρύθμιση δωματίων"
              description="Ορίστε πόσα δωμάτια έχει το κατάλυμα για να δημιουργηθούν με αύξοντες αριθμούς (1, 2, 3…)."
            />
            <div className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="bulk-rooms">
                  Πόσα δωμάτια διαθέτει το κατάλυμα;
                </Label>
                <Input
                  id="bulk-rooms"
                  type="number"
                  min={1}
                  max={300}
                  value={bulkCount}
                  onChange={(e) => setBulkCount(e.target.value)}
                />
              </div>
              <Button disabled={busy} onClick={() => void handleBulkCreate()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Δημιουργία δωματίων
              </Button>
            </div>
          </div>
        ) : list.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="Δεν υπάρχει χώρος καθαρισμού"
              description={
                hotelMode
                  ? "Ορίστε τα δωμάτια για να ξεκινήσετε."
                  : `Θα δημιουργηθεί αυτόματα χώρος για «${propertyName || "το κατάλυμα"}». Ανανεώστε ή δοκιμάστε ξανά.`
              }
            />
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>
              Ανανέωση
            </Button>
          </div>
        ) : (
          <ul className="divide-y border-t">
            {list.map((row) => {
              const open = expandedId === row.locationId;
              const qr = qrByLocation[row.locationId];
              const token = qr?.token ?? null;
              const canArchive =
                hotelMode || requiresManualResolution || list.length > 1;
              return (
                <li key={row.locationId} className="px-3 py-2 sm:px-4">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 text-left"
                    onClick={() => void handleExpand(row.locationId)}
                    aria-expanded={open}
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{row.name}</span>
                        <StatusBadge
                          status={row.readinessStatus}
                          label={readinessLabel(row.readinessStatus)}
                        />
                        {row.hasActiveQr ? (
                          <span className="text-xs text-muted-foreground">QR</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Τελευταίος καθαρισμός: {formatWhen(row.lastCompletedAt)}
                        {row.openTask
                          ? ` · Εργασία: ${row.openTask.title}`
                          : ""}
                      </p>
                    </div>
                  </button>

                  {open ? (
                    <div className="mt-3 grid gap-4 border-t pt-3 md:grid-cols-[1fr_auto]">
                      <div className="space-y-3 text-sm">
                        <dl className="grid gap-1 sm:grid-cols-2">
                          <div>
                            <dt className="text-muted-foreground">Κατάσταση</dt>
                            <dd>{readinessLabel(row.readinessStatus)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Τελευταίος καθαρισμός</dt>
                            <dd>{formatWhen(row.lastCompletedAt)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Ανοιχτή εργασία</dt>
                            <dd>{row.openTask?.title ?? "—"}</dd>
                          </div>
                        </dl>

                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link
                              href={`/dashboard/housekeeping/history?cleaningLocationId=${row.locationId}`}
                            >
                              Ιστορικό
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRenameId(row.locationId);
                              setRenameName(row.name);
                            }}
                          >
                            Μετονομασία
                          </Button>
                          {canArchive ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setArchiveId(row.locationId)}
                            >
                              Αρχειοθέτηση
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="min-w-[220px] space-y-3 rounded-lg border bg-muted/20 p-3">
                        {qrLoadingId === row.locationId ? (
                          <Skeleton className="h-40 w-full" />
                        ) : token ? (
                          <div className="space-y-2">
                            <div className="flex justify-center rounded bg-white p-3">
                              <QRCodeSVG
                                value={buildQrScanUrl(token)}
                                size={180}
                                level="M"
                              />
                            </div>
                            <p className="text-center text-xs text-muted-foreground">
                              Σαρώστε για πρόσβαση στην καθαριότητα
                            </p>
                          </div>
                        ) : qr?.status === "ACTIVE" ? (
                          <p className="text-sm text-muted-foreground">
                            Ο υπάρχων κωδικός QR παραμένει ενεργός, αλλά δημιουργήθηκε
                            πριν ενεργοποιηθεί η μόνιμη προβολή. Αντικαταστήστε τον μία
                            φορά για να εμφανίζεται και να εκτυπώνεται από εδώ.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Δεν υπάρχει ακόμα κωδικός QR
                            {hotelMode ? " για αυτό το δωμάτιο" : ""}.
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {qr?.status !== "ACTIVE" ? (
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => void ensureQr(row.locationId, true)}
                            >
                              Δημιουργία QR
                            </Button>
                          ) : null}
                          {token ? (
                            <Button size="sm" variant="outline" asChild>
                              <Link
                                href={`/dashboard/housekeeping/locations/qr/${row.locationId}/print`}
                                target="_blank"
                              >
                                <Printer className="h-4 w-4" />
                                Εκτύπωση
                              </Link>
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setRotateId(row.locationId)}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Αντικατάσταση
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Surface>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Προσθήκη δωματίου</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="add-room-name">Όνομα</Label>
              <Input
                id="add-room-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="π.χ. 12 ή Σουίτα Α"
              />
            </div>
            <Button disabled={busy} onClick={() => void handleAdd()}>
              Αποθήκευση
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(renameId)} onOpenChange={(open) => !open && setRenameId(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {hotelMode ? "Μετονομασία δωματίου" : "Μετονομασία χώρου"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rename-room-name">Όνομα</Label>
              <Input
                id="rename-room-name"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
              />
            </div>
            <Button disabled={busy} onClick={() => void handleRename()}>
              Αποθήκευση
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(archiveId)}
        onOpenChange={(open) => !open && setArchiveId(null)}
        title={hotelMode ? "Αρχειοθέτηση δωματίου" : "Αρχειοθέτηση χώρου"}
        description="Θα αφαιρεθεί από τον πίνακα. Το ιστορικό καθαρισμών διατηρείται."
        confirmLabel="Αρχειοθέτηση"
        destructive
        onConfirm={() => void handleArchive()}
      />

      <ConfirmDialog
        open={Boolean(rotateId)}
        onOpenChange={(open) => !open && setRotateId(null)}
        title="Αντικατάσταση κωδικού QR"
        description="Το τρέχον αυτοκόλλητο σταματά αμέσως. Εκτυπώστε και τοποθετήστε τον νέο κωδικό πριν τον επόμενο καθαρισμό."
        confirmLabel="Αντικατάσταση"
        destructive
        onConfirm={() => void handleRotate()}
      />
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, Loader2, Trash2 } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import {
  completeCleaning,
  deleteCleaningPhoto,
  fetchCleaningContext,
  startCleaning,
  updateCleaningItem,
  uploadCleaningPhoto,
} from "@/lib/admin/api";
import type {
  CleaningContextRecord,
  CleaningExecutionRecord,
} from "@/lib/admin/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/admin/error-state";
import { toastError, toastSuccess } from "@/lib/admin/toast";

const MAX_PHOTOS = 12;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

type CleaningFormProps = {
  locationId?: string;
  unitId?: string;
  /** Rendered above the card, e.g. after resolving a scanned code. */
  scannedFrom?: string;
};

/**
 * Phone-first cleaning run: checklist, evidence photos, single Complete action.
 * Every control is at least 44px tall so it stays usable with gloves on.
 */
export function CleaningForm({
  locationId,
  unitId,
  scannedFrom,
}: CleaningFormProps) {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [context, setContext] = useState<CleaningContextRecord | null>(null);
  const [execution, setExecution] = useState<CleaningExecutionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingItemRef = useRef<string | null>(null);

  const target = locationId
    ? ({ locationId } as const)
    : unitId
      ? ({ unitId } as const)
      : null;

  const load = useCallback(async () => {
    if (!tenantId || !target) return;
    try {
      const next = await fetchCleaningContext(tenantId, target);
      setContext(next);
      setExecution(next.activeExecution);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης καθαρισμού");
    } finally {
      setLoading(false);
    }
  }, [tenantId, locationId, unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStart() {
    if (!tenantId || !target || busy) return;
    setBusy(true);
    try {
      const result = await startCleaning(tenantId, target);
      setExecution(result.execution);
      toastSuccess(result.created ? "Ξεκίνησε ο καθαρισμός" : "Συνεχίστηκε ο καθαρισμός");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Δεν ήταν δυνατή η έναρξη καθαρισμού");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleItem(itemId: string, checked: boolean) {
    if (!tenantId || !execution || busy) return;
    // Optimistic — the server is still the authority on completion.
    setExecution({
      ...execution,
      items: execution.items.map((item) =>
        item.id === itemId ? { ...item, checked } : item,
      ),
    });
    try {
      await updateCleaningItem(tenantId, execution.id, itemId, checked);
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Δεν ήταν δυνατή η ενημέρωση στοιχείου");
      await load();
    }
  }

  function openPhotoPicker(itemId: string | null) {
    pendingItemRef.current = itemId;
    fileInputRef.current?.click();
  }

  async function handlePhotoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !tenantId || !execution) return;

    if (file.size > MAX_PHOTO_BYTES) {
      toastError("Η φωτογραφία είναι μεγαλύτερη από 10MB");
      return;
    }
    if (execution.photos.length >= MAX_PHOTOS) {
      toastError(`Ένας καθαρισμός δέχεται το πολύ ${MAX_PHOTOS} φωτογραφίες`);
      return;
    }

    setBusy(true);
    try {
      await uploadCleaningPhoto(
        tenantId,
        execution.id,
        file,
        pendingItemRef.current,
      );
      toastSuccess("Προστέθηκε φωτογραφία");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία μεταφόρτωσης φωτογραφίας");
    } finally {
      pendingItemRef.current = null;
      setBusy(false);
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!tenantId || !execution || busy) return;
    setBusy(true);
    try {
      await deleteCleaningPhoto(tenantId, execution.id, photoId);
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Δεν ήταν δυνατή η αφαίρεση φωτογραφίας");
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    if (!tenantId || !execution || busy) return;
    setBusy(true);
    try {
      const result = await completeCleaning(tenantId, execution.id, {
        expectedVersion: execution.version,
        completionNote: note.trim() || null,
      });
      setDone(true);
      toastSuccess(
        result.housekeeping?.status === "CLEAN"
          ? "Ολοκληρώθηκε ο καθαρισμός — η μονάδα σημειώθηκε καθαρή"
          : "Ολοκληρώθηκε ο καθαρισμός",
      );
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Δεν ήταν δυνατή η ολοκλήρωση καθαρισμού");
    } finally {
      setBusy(false);
    }
  }

  if (tenantLoading || loading) return <Skeleton className="h-96 w-full" />;
  if (tenantError) return <ErrorState message={tenantError} />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!context) return <ErrorState message="Η μονάδα δεν βρέθηκε" />;

  const readiness = context.readiness;
  const blockers = readiness?.blockers ?? [];
  const photoCount = execution?.photos.length ?? 0;
  const minimumPhotos = context.template?.minimumCompletionPhotos ?? 0;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 p-4 pb-24">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        capture="environment"
        className="hidden"
        onChange={(e) => void handlePhotoSelected(e)}
        data-testid="cleaning-photo-input"
      />

      <header className="space-y-1">
        {scannedFrom ? (
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {scannedFrom}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold leading-tight">{context.unitName}</h1>
        <p className="text-sm text-muted-foreground">{context.propertyName}</p>
        <p className="text-sm">
          Κατάσταση:{" "}
          <span
            className={
              context.housekeepingStatus === "DIRTY"
                ? "font-semibold text-amber-700"
                : "font-semibold text-emerald-700"
            }
          >
            {context.housekeepingStatus === "DIRTY" ? "Βρώμικο" : "Καθαρό"}
          </span>
        </p>
      </header>

      {done || (execution && execution.status === "COMPLETED") ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-medium text-emerald-900">Ολοκληρώθηκε ο καθαρισμός</p>
          <p className="mt-1 text-sm text-emerald-800">
            Η εργασία καθαριότητας έκλεισε και το δωμάτιο σημειώθηκε καθαρό.
          </p>
          <Link
            href={
              context.locationId
                ? `/dashboard/housekeeping/history?cleaningLocationId=${context.locationId}`
                : context.unitId
                  ? `/dashboard/housekeeping/history?unitId=${context.unitId}`
                  : "/dashboard/housekeeping/history"
            }
            className="mt-3 inline-block text-sm underline"
          >
            Ιστορικό καθαρισμών
          </Link>
        </div>
      ) : null}

      {!context.canPerform ? (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
          Μπορείτε να δείτε αυτή τη μονάδα, αλλά δεν έχετε δικαίωμα καταγραφής καθαρισμών
          για αυτό το κατάλυμα.
        </div>
      ) : null}

      {!execution && context.selection.kind === "NO_WORK" ? (
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="font-medium">Δεν υπάρχει κάτι προς καθαρισμό</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Η μονάδα είναι ήδη καθαρή και δεν έχει ανοιχτή εργασία καθαριότητας.
          </p>
        </div>
      ) : null}

      {!execution && context.selection.kind !== "NO_WORK" && context.canPerform ? (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            {context.task
              ? `Συνδεδεμένη εργασία: ${context.task.title}`
              : "Θα ανοίξει εργασία καθαριότητας για αυτόν τον καθαρισμό."}
          </p>
          <p className="text-sm text-muted-foreground">
            Λίστα ελέγχου: {context.template.name} · {context.template.itemCount}{" "}
            στοιχεία
          </p>
          <Button
            className="min-h-12 w-full text-base"
            onClick={() => void handleStart()}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Έναρξη καθαρισμού
          </Button>
        </div>
      ) : null}

      {execution && execution.status === "IN_PROGRESS" ? (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Λίστα ελέγχου
            </h2>
            {execution.items.length === 0 ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                Δεν υπάρχουν στοιχεία — προσθέστε φωτογραφίες και ολοκληρώστε όταν η μονάδα είναι έτοιμη.
              </p>
            ) : (
              <ul className="space-y-2">
                {execution.items.map((item) => {
                  const itemPhotos = execution.photos.filter(
                    (photo) => photo.executionItemId === item.id,
                  );
                  return (
                    <li key={item.id} className="rounded-lg border p-3">
                      <label className="flex min-h-11 cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-6 w-6 shrink-0 rounded border-input"
                          checked={item.checked}
                          disabled={busy || !context.canPerform}
                          onChange={(e) =>
                            void handleToggleItem(item.id, e.target.checked)
                          }
                        />
                        <span className="flex-1">
                          <span className="block text-base font-medium leading-snug">
                            {item.label}
                            {item.required ? (
                              <span className="ml-1 text-destructive" title="Υποχρεωτικό">
                                *
                              </span>
                            ) : (
                              <span className="ml-1 text-xs font-normal text-muted-foreground">
                                (προαιρετικό)
                              </span>
                            )}
                          </span>
                          {item.description ? (
                            <details className="mt-1 group">
                              <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
                                <span className="group-open:hidden">Οδηγίες</span>
                                <span className="hidden group-open:inline">Απόκρυψη οδηγιών</span>
                              </summary>
                              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                                {item.description}
                              </p>
                            </details>
                          ) : null}
                          {item.photoRequired ? (
                            <span className="mt-1 block text-xs font-medium text-amber-700">
                              Απαιτείται φωτογραφία ({itemPhotos.length})
                            </span>
                          ) : null}
                        </span>
                      </label>
                      {item.photoRequired ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-2 min-h-11 w-full"
                          disabled={busy || !context.canPerform}
                          onClick={() => openPhotoPicker(item.id)}
                        >
                          <Camera className="h-4 w-4" />
                          Προσθήκη φωτογραφίας για αυτό το στοιχείο
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Φωτογραφίες ({photoCount}/{MAX_PHOTOS})
              {minimumPhotos > 0 ? ` · ${minimumPhotos} απαιτούνται` : ""}
            </h2>
            {execution.photos.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2">
                {execution.photos.map((photo) => (
                  <li key={photo.id} className="relative">
                    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-muted text-xs text-muted-foreground">
                      {photo.url && photo.url.startsWith("http") ? (
                        <img
                          src={photo.url}
                          alt="Απόδειξη καθαρισμού"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span>Φωτο</span>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label="Αφαίρεση φωτογραφίας"
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-1.5 shadow"
                      disabled={busy || !context.canPerform}
                      onClick={() => void handleDeletePhoto(photo.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full"
              disabled={busy || photoCount >= MAX_PHOTOS || !context.canPerform}
              onClick={() => openPhotoPicker(null)}
            >
              <Camera className="h-4 w-4" />
              Προσθήκη φωτογραφίας
            </Button>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG ή WebP · έως 10MB η καθεμία
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Σημείωση (προαιρετικό)
            </h2>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ό,τι πρέπει να γνωρίζει η επόμενη βάρδια"
              rows={3}
            />
          </section>

          {blockers.length > 0 ? (
            <ul
              role="alert"
              className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              {blockers.map((blocker, index) => (
                <li key={`${blocker.code}-${index}`}>{blocker.message}</li>
              ))}
            </ul>
          ) : null}

          <div className="fixed inset-x-0 bottom-0 border-t bg-background p-4">
            <div className="mx-auto max-w-lg">
              <Button
                className="min-h-14 w-full text-base"
                disabled={busy || !readiness?.ready || !context.canPerform}
                onClick={() => void handleComplete()}
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Check className="h-5 w-5" />
                )}
                Ολοκλήρωση καθαρισμού
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

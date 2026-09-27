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
  unitId: string;
  /** Rendered above the card, e.g. after resolving a scanned code. */
  scannedFrom?: string;
};

/**
 * Phone-first cleaning run: checklist, evidence photos, single Complete action.
 * Every control is at least 44px tall so it stays usable with gloves on.
 */
export function CleaningForm({ unitId, scannedFrom }: CleaningFormProps) {
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

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const next = await fetchCleaningContext(tenantId, unitId);
      setContext(next);
      setExecution(next.activeExecution);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cleaning");
    } finally {
      setLoading(false);
    }
  }, [tenantId, unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStart() {
    if (!tenantId || busy) return;
    setBusy(true);
    try {
      const result = await startCleaning(tenantId, unitId);
      setExecution(result.execution);
      toastSuccess(result.created ? "Cleaning started" : "Cleaning resumed");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not start cleaning");
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
      toastError(err instanceof Error ? err.message : "Could not update item");
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
      toastError("Photo is larger than 10MB");
      return;
    }
    if (execution.photos.length >= MAX_PHOTOS) {
      toastError(`A cleaning can hold at most ${MAX_PHOTOS} photos`);
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
      toastSuccess("Photo added");
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Photo upload failed");
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
      toastError(err instanceof Error ? err.message : "Could not remove photo");
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
          ? "Cleaning complete — unit marked clean"
          : "Cleaning complete",
      );
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not complete cleaning");
    } finally {
      setBusy(false);
    }
  }

  if (tenantLoading || loading) return <Skeleton className="h-96 w-full" />;
  if (tenantError) return <ErrorState message={tenantError} />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!context) return <ErrorState message="Unit not found" />;

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
          Status:{" "}
          <span
            className={
              context.housekeepingStatus === "DIRTY"
                ? "font-semibold text-amber-700"
                : "font-semibold text-emerald-700"
            }
          >
            {context.housekeepingStatus === "DIRTY" ? "Dirty" : "Clean"}
          </span>
        </p>
      </header>

      {done || (execution && execution.status === "COMPLETED") ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-medium text-emerald-900">Cleaning complete</p>
          <p className="mt-1 text-sm text-emerald-800">
            The housekeeping task is closed and this unit is marked clean.
          </p>
          <Link
            href={`/dashboard/housekeeping/history?unitId=${context.unitId}`}
            className="mt-3 inline-block text-sm underline"
          >
            View cleaning history
          </Link>
        </div>
      ) : null}

      {!context.canPerform ? (
        <div className="rounded-lg border bg-muted/40 p-4 text-sm">
          You can view this unit but you are not authorized to record cleanings
          for this property.
        </div>
      ) : null}

      {!execution && context.selection.kind === "NO_WORK" ? (
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="font-medium">Nothing to clean</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This unit is already clean and has no open housekeeping task.
          </p>
        </div>
      ) : null}

      {!execution && context.selection.kind !== "NO_WORK" && context.canPerform ? (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            {context.task
              ? `Linked task: ${context.task.title}`
              : "A housekeeping task will be opened for this cleaning."}
          </p>
          {context.template ? (
            <p className="text-sm text-muted-foreground">
              Checklist: {context.template.name} · {context.template.itemCount} items
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No checklist configured for this property.
            </p>
          )}
          <Button
            className="min-h-12 w-full text-base"
            onClick={() => void handleStart()}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Start cleaning
          </Button>
        </div>
      ) : null}

      {execution && execution.status === "IN_PROGRESS" ? (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Checklist
            </h2>
            {execution.items.length === 0 ? (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                No checklist items — add photos and complete when the unit is ready.
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
                          <span className="block text-base leading-snug">
                            {item.label}
                            {item.required ? (
                              <span className="ml-1 text-destructive">*</span>
                            ) : null}
                          </span>
                          {item.description ? (
                            <span className="mt-0.5 block text-sm text-muted-foreground">
                              {item.description}
                            </span>
                          ) : null}
                          {item.photoRequired ? (
                            <span className="mt-1 block text-xs font-medium text-amber-700">
                              Photo required ({itemPhotos.length})
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
                          Add photo for this item
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
              Photos ({photoCount}/{MAX_PHOTOS})
              {minimumPhotos > 0 ? ` · ${minimumPhotos} required` : ""}
            </h2>
            {execution.photos.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2">
                {execution.photos.map((photo) => (
                  <li key={photo.id} className="relative">
                    <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-muted text-xs text-muted-foreground">
                      {photo.url && photo.url.startsWith("http") ? (
                        <img
                          src={photo.url}
                          alt="Cleaning evidence"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span>Photo</span>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label="Remove photo"
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
              Add photo
            </Button>
            <p className="text-xs text-muted-foreground">
              JPEG, PNG or WebP · up to 10MB each
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Note (optional)
            </h2>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the next shift should know"
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
                Complete cleaning
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

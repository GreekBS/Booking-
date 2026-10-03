"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatOperatorDateTime } from "@/lib/admin/money-presentation";
import {
  discardReservationImportDraft,
  listReservationImportDrafts,
  type ReservationImportBatchDto,
} from "@/lib/admin/reservation-import-api";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { elCommon } from "@/lib/i18n";
import {
  RESERVATION_IMPORT_DISCARD_DESCRIPTION,
  RESERVATION_IMPORT_DISCARD_ERROR,
  RESERVATION_IMPORT_DISCARD_SUCCESS,
  RESERVATION_IMPORT_DISCARD_TITLE,
  RESERVATION_IMPORT_DRAFT_TTL_MESSAGE,
  RESERVATION_IMPORT_LOAD_LIST_ERROR,
} from "./reservation-import-copy";

interface ReservationImportDraftListProps {
  tenantId: string;
}

export function ReservationImportDraftList({
  tenantId,
}: ReservationImportDraftListProps) {
  const [drafts, setDrafts] = useState<ReservationImportBatchDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [discardTarget, setDiscardTarget] = useState<ReservationImportBatchDto | null>(
    null,
  );
  const [discarding, setDiscarding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listReservationImportDrafts(tenantId);
      setDrafts(data);
    } catch {
      setDrafts(null);
      setError(RESERVATION_IMPORT_LOAD_LIST_ERROR);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDiscard() {
    if (!discardTarget) return;
    setDiscarding(true);
    try {
      await discardReservationImportDraft(tenantId, discardTarget.id);
      toastSuccess(RESERVATION_IMPORT_DISCARD_SUCCESS);
      setDiscardTarget(null);
      await load();
    } catch {
      toastError(RESERVATION_IMPORT_DISCARD_ERROR);
    } finally {
      setDiscarding(false);
    }
  }

  if (loading && drafts === null && !error) {
    return <Skeleton className="h-24 w-full" aria-label="Φόρτωση πρόχειρων εισαγωγών" />;
  }

  if (error) {
    return (
      <Surface variant="panel" padding="sm" className="space-y-2">
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          {elCommon.retry}
        </Button>
      </Surface>
    );
  }

  if (!drafts || drafts.length === 0) {
    return null;
  }

  return (
    <>
      <Surface variant="panel" padding="sm" className="space-y-3">
        <SurfaceHeader
          title="Πρόχειρες εισαγωγές"
          description={RESERVATION_IMPORT_DRAFT_TTL_MESSAGE}
        />
        <ul className="space-y-2" aria-label="Πρόχειρες εισαγωγές CSV">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="flex flex-col gap-3 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {draft.filename || "import.csv"}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Δημιουργήθηκε: {formatOperatorDateTime(draft.createdAt)}
                  </span>
                  <span>
                    Λήγει: {formatOperatorDateTime(draft.expiresAt)}
                  </span>
                  <span>
                    {draft.rowCount === 1
                      ? "1 γραμμή"
                      : `${draft.rowCount} γραμμές`}
                  </span>
                  <StatusBadge status={draft.status} label="Πρόχειρο" />
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/dashboard/bookings/import/${draft.id}`}>
                    Συνέχεια
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDiscardTarget(draft)}
                >
                  Απόρριψη
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Surface>

      <ConfirmDialog
        open={Boolean(discardTarget)}
        onOpenChange={(open) => {
          if (!open && !discarding) setDiscardTarget(null);
        }}
        title={RESERVATION_IMPORT_DISCARD_TITLE}
        description={RESERVATION_IMPORT_DISCARD_DESCRIPTION}
        confirmLabel="Απόρριψη"
        destructive
        loading={discarding}
        onConfirm={handleDiscard}
      />
    </>
  );
}

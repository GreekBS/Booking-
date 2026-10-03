"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ErrorState } from "@/components/admin/error-state";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { formatOperatorDateTime } from "@/lib/admin/money-presentation";
import {
  discardReservationImportDraft,
  getReservationImportDraft,
  isReservationImportExpiredError,
  isReservationImportNotFoundError,
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
  RESERVATION_IMPORT_EXPIRED_MESSAGE,
  RESERVATION_IMPORT_LOAD_DRAFT_ERROR,
  RESERVATION_IMPORT_NOT_FOUND_MESSAGE,
} from "./reservation-import-copy";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; batch: ReservationImportBatchDto; rowCountLoaded: number }
  | { kind: "expired" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

/**
 * B3.1 draft resume shell. Later phases add Review / Prices / Conflicts steps here.
 */
export function ReservationImportDraftPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = typeof params.batchId === "string" ? params.batchId : "";
  const router = useRouter();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !batchId) return;
    setState({ kind: "loading" });
    try {
      const detail = await getReservationImportDraft(tenantId, batchId);
      setState({
        kind: "ready",
        batch: detail.batch,
        rowCountLoaded: detail.rows.length,
      });
    } catch (error) {
      if (isReservationImportExpiredError(error)) {
        setState({ kind: "expired" });
        return;
      }
      if (isReservationImportNotFoundError(error)) {
        setState({ kind: "not_found" });
        return;
      }
      setState({ kind: "error", message: RESERVATION_IMPORT_LOAD_DRAFT_ERROR });
    }
  }, [tenantId, batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDiscard() {
    if (!tenantId || !batchId) return;
    setDiscarding(true);
    try {
      await discardReservationImportDraft(tenantId, batchId);
      toastSuccess(RESERVATION_IMPORT_DISCARD_SUCCESS);
      setDiscardOpen(false);
      router.push("/dashboard/bookings");
    } catch {
      toastError(RESERVATION_IMPORT_DISCARD_ERROR);
    } finally {
      setDiscarding(false);
    }
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;

  if (!batchId) {
    return (
      <ErrorState
        message={RESERVATION_IMPORT_NOT_FOUND_MESSAGE}
        onRetry={() => router.push("/dashboard/bookings")}
      />
    );
  }

  if (state.kind === "loading") {
    return <Skeleton className="h-72 w-full" aria-label="Φόρτωση πρόχειρης εισαγωγής" />;
  }

  if (state.kind === "expired") {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <PageHeader
          title="Εισαγωγή από CSV"
          description={RESERVATION_IMPORT_EXPIRED_MESSAGE}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/bookings">{elCommon.back}</Link>
            </Button>
          }
        />
        <Surface variant="panel" padding="md" className="space-y-3">
          <p className="text-sm text-muted-foreground" role="status">
            {RESERVATION_IMPORT_EXPIRED_MESSAGE}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link href="/dashboard/bookings/import">Νέα εισαγωγή CSV</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/bookings">Πίσω στις κρατήσεις</Link>
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  if (state.kind === "not_found") {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <PageHeader
          title="Εισαγωγή από CSV"
          description={RESERVATION_IMPORT_NOT_FOUND_MESSAGE}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/bookings">{elCommon.back}</Link>
            </Button>
          }
        />
        <ErrorState
          message={RESERVATION_IMPORT_NOT_FOUND_MESSAGE}
          onRetry={() => router.push("/dashboard/bookings")}
        />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <PageHeader
          title="Εισαγωγή από CSV"
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/bookings">{elCommon.back}</Link>
            </Button>
          }
        />
        <ErrorState message={state.message} onRetry={() => void load()} />
      </div>
    );
  }

  const { batch, rowCountLoaded } = state;
  const rowLabel =
    batch.rowCount === 1 ? "1 γραμμή" : `${batch.rowCount} γραμμές`;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Πρόχειρη εισαγωγή CSV"
        description={batch.filename || "import.csv"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/bookings">{elCommon.back}</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDiscardOpen(true)}
            >
              Απόρριψη
            </Button>
          </div>
        }
      />

      <Surface variant="attention" padding="sm">
        <p className="text-sm text-foreground" role="status">
          {RESERVATION_IMPORT_DRAFT_TTL_MESSAGE}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Λήγει: {formatOperatorDateTime(batch.expiresAt)}
        </p>
      </Surface>

      <Surface variant="panel" padding="md" className="space-y-4">
        <SurfaceHeader
          title="Στοιχεία προχείρου"
          description="Η ανασκόπηση, οι τιμές και οι συγκρούσεις θα ολοκληρωθούν στα επόμενα βήματα."
        />
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Αρχείο
            </dt>
            <dd className="mt-0.5 font-medium text-foreground break-all">
              {batch.filename || "import.csv"}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {elCommon.status}
            </dt>
            <dd className="mt-0.5">
              <StatusBadge status={batch.status} label="Πρόχειρο" />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Δημιουργήθηκε
            </dt>
            <dd className="mt-0.5 text-foreground">
              {formatOperatorDateTime(batch.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Λήγει
            </dt>
            <dd className="mt-0.5 text-foreground">
              {formatOperatorDateTime(batch.expiresAt)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Γραμμές
            </dt>
            <dd className="mt-0.5 text-foreground">
              {rowLabel}
              {rowCountLoaded !== batch.rowCount ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  (φορτώθηκαν {rowCountLoaded})
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </Surface>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={(open) => {
          if (!open && !discarding) setDiscardOpen(false);
        }}
        title={RESERVATION_IMPORT_DISCARD_TITLE}
        description={RESERVATION_IMPORT_DISCARD_DESCRIPTION}
        confirmLabel="Απόρριψη"
        destructive
        loading={discarding}
        onConfirm={handleDiscard}
      />
    </div>
  );
}

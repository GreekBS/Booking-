"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ErrorState } from "@/components/admin/error-state";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { formatOperatorDateTime } from "@/lib/admin/money-presentation";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { elCommon } from "@/lib/i18n";
import {
  RESERVATION_IMPORT_DISCARD_DESCRIPTION,
  RESERVATION_IMPORT_DISCARD_ERROR,
  RESERVATION_IMPORT_DISCARD_SUCCESS,
  RESERVATION_IMPORT_DISCARD_TITLE,
  RESERVATION_IMPORT_DRAFT_TTL_MESSAGE,
  RESERVATION_IMPORT_EXPIRED_MESSAGE,
  RESERVATION_IMPORT_NOT_FOUND_MESSAGE,
  RESERVATION_IMPORT_PHASE_C_PLACEHOLDER,
  RESERVATION_IMPORT_RECHECK_DESCRIPTION,
  RESERVATION_IMPORT_RECHECK_ERROR,
  RESERVATION_IMPORT_RECHECK_LABEL,
  RESERVATION_IMPORT_RECHECK_SUCCESS,
  RESERVATION_IMPORT_REVIEW_TITLE,
} from "./reservation-import-copy";
import { ReservationImportRejectedRowCard } from "./ReservationImportRejectedRowCard";
import { ReservationImportReviewRowCard } from "./ReservationImportReviewRowCard";
import {
  computeReadinessCounts,
  filterRowsForTab,
  tabCounts,
  type ReviewTabId,
} from "./reservation-import-review-utils";
import { useReservationImportReview } from "./useReservationImportReview";

/**
 * B3.3b review page — display, tabs, recheck refetch; conflict/price actions in B3.3c/d.
 */
export function ReservationImportDraftPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = typeof params.batchId === "string" ? params.batchId : "";
  const router = useRouter();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    state,
    unitLabel,
    refreshing,
    rechecking,
    discarding,
    recheck,
    discard,
    reload,
  } = useReservationImportReview(tenantId, batchId);

  const [discardOpen, setDiscardOpen] = useState(false);
  const [tab, setTab] = useState<ReviewTabId>("all");
  const [liveMessage, setLiveMessage] = useState("");

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
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          title={RESERVATION_IMPORT_REVIEW_TITLE}
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
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title={RESERVATION_IMPORT_REVIEW_TITLE} />
        <ErrorState
          message={RESERVATION_IMPORT_NOT_FOUND_MESSAGE}
          onRetry={() => router.push("/dashboard/bookings")}
        />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title={RESERVATION_IMPORT_REVIEW_TITLE} />
        <ErrorState message={state.message} onRetry={() => void reload()} />
      </div>
    );
  }

  const { detail } = state;
  const { batch, rows, rejectedRows, conflictBookings } = detail;
  const counts = computeReadinessCounts(rows, rejectedRows);
  const tabs = tabCounts(rows, rejectedRows);
  async function handleDiscard() {
    const ok = await discard();
    if (ok) {
      toastSuccess(RESERVATION_IMPORT_DISCARD_SUCCESS);
      setDiscardOpen(false);
      router.push("/dashboard/bookings");
    } else {
      toastError(RESERVATION_IMPORT_DISCARD_ERROR);
    }
  }

  async function handleRecheck() {
    const ok = await recheck();
    if (ok) {
      toastSuccess(RESERVATION_IMPORT_RECHECK_SUCCESS);
      setLiveMessage(RESERVATION_IMPORT_RECHECK_SUCCESS);
      setTab("action");
    } else {
      toastError(RESERVATION_IMPORT_RECHECK_ERROR);
      setLiveMessage(RESERVATION_IMPORT_RECHECK_ERROR);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-8">
      <div aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      <PageHeader
        title={RESERVATION_IMPORT_REVIEW_TITLE}
        description={batch.filename || "import.csv"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/bookings">{elCommon.back}</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={rechecking || refreshing}
              onClick={() => void handleRecheck()}
            >
              {rechecking ? "Επανέλεγχος…" : RESERVATION_IMPORT_RECHECK_LABEL}
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
          title="Σύνοψη προχείρου"
          description={RESERVATION_IMPORT_RECHECK_DESCRIPTION}
        />
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
            <dd className="mt-0.5">{formatOperatorDateTime(batch.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Λήγει
            </dt>
            <dd className="mt-0.5">{formatOperatorDateTime(batch.expiresAt)}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-md bg-muted px-2 py-1">
            Αποδεκτές: <strong>{counts.accepted}</strong>
          </span>
          <span className="rounded-md bg-muted px-2 py-1">
            Έτοιμες: <strong>{counts.ready}</strong>
          </span>
          <span className="rounded-md bg-muted px-2 py-1">
            Παραλείφθηκαν: <strong>{counts.skipped}</strong>
          </span>
          <span className="rounded-md bg-muted px-2 py-1">
            Χρειάζονται ενέργεια: <strong>{counts.needAction}</strong>
          </span>
          <span className="rounded-md bg-muted px-2 py-1">
            Απορριφθείσες: <strong>{counts.rejected}</strong>
          </span>
        </div>

        <p className="text-xs text-muted-foreground">{RESERVATION_IMPORT_PHASE_C_PLACEHOLDER}</p>
      </Surface>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as ReviewTabId)}
        className="space-y-4"
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="all">Όλες ({tabs.all})</TabsTrigger>
          <TabsTrigger value="action">Χρειάζονται ενέργεια ({tabs.action})</TabsTrigger>
          <TabsTrigger value="ready">Έτοιμες ({tabs.ready})</TabsTrigger>
          <TabsTrigger value="conflicts">Συγκρούσεις ({tabs.conflicts})</TabsTrigger>
          <TabsTrigger value="rejected">Απορριφθείσες ({tabs.rejected})</TabsTrigger>
        </TabsList>

        <TabsContent value="rejected" className="space-y-3">
          {rejectedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Δεν υπάρχουν απορριφθείσες γραμμές.</p>
          ) : (
            rejectedRows.map((r) => <ReservationImportRejectedRowCard key={r.id} row={r} />)
          )}
        </TabsContent>

        {(["all", "action", "ready", "conflicts"] as const).map((tabId) => {
          const tabRows = filterRowsForTab(tabId, rows);
          return (
            <TabsContent key={tabId} value={tabId} className="space-y-3">
              {tabRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Δεν υπάρχουν γραμμές σε αυτή την κατηγορία.
                </p>
              ) : (
                tabRows.map((row) => (
                  <ReservationImportReviewRowCard
                    key={row.id}
                    row={row}
                    allRows={rows}
                    conflictBookings={conflictBookings ?? []}
                    unitLabel={unitLabel}
                  />
                ))
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {refreshing ? (
        <p className="text-xs text-muted-foreground" role="status">
          Ανανέωση από τον διακομιστή…
        </p>
      ) : null}

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

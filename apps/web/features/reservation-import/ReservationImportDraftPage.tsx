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
  RESERVATION_IMPORT_BACK_TO_BOOKINGS,
  RESERVATION_IMPORT_CHANGE_FILE_LABEL,
  RESERVATION_IMPORT_COMMIT_BUSY_LABEL,
  RESERVATION_IMPORT_COMMIT_CONFIRM_BODY,
  RESERVATION_IMPORT_COMMIT_CONFIRM_TITLE,
  RESERVATION_IMPORT_COMMIT_ERROR,
  RESERVATION_IMPORT_COMMIT_LABEL,
  RESERVATION_IMPORT_COMMIT_NOT_READY_ERROR,
  RESERVATION_IMPORT_COMMIT_REFETCH_ERROR,
  RESERVATION_IMPORT_COMMIT_STALE_ERROR,
  RESERVATION_IMPORT_COMMIT_SUCCESS,
  RESERVATION_IMPORT_COMPLETED_TITLE,
  RESERVATION_IMPORT_CREATED_BOOKINGS_TITLE,
  RESERVATION_IMPORT_DECISION_ERROR,
  RESERVATION_IMPORT_DECISION_SUCCESS,
  RESERVATION_IMPORT_DISCARD_DESCRIPTION,
  RESERVATION_IMPORT_DISCARD_ERROR,
  RESERVATION_IMPORT_DISCARD_SUCCESS,
  RESERVATION_IMPORT_DISCARD_TITLE,
  RESERVATION_IMPORT_DRAFT_TTL_MESSAGE,
  RESERVATION_IMPORT_EXPIRED_MESSAGE,
  RESERVATION_IMPORT_FINAL_SUMMARY_TITLE,
  RESERVATION_IMPORT_NOT_FOUND_MESSAGE,
  RESERVATION_IMPORT_PRICE_BATCH_ERROR,
  RESERVATION_IMPORT_PRICE_BATCH_SUCCESS,
  RESERVATION_IMPORT_PRICE_ERROR,
  RESERVATION_IMPORT_PRICE_SUCCESS,
  RESERVATION_IMPORT_RECHECK_DESCRIPTION,
  RESERVATION_IMPORT_RECHECK_ERROR,
  RESERVATION_IMPORT_RECHECK_LABEL,
  RESERVATION_IMPORT_RECHECK_SUCCESS,
  RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR,
  RESERVATION_IMPORT_REVIEW_TITLE,
  RESERVATION_IMPORT_USE_TALOS_ALL_MISSING_HINT,
  RESERVATION_IMPORT_USE_TALOS_ALL_MISSING_LABEL,
  RESERVATION_IMPORT_VIEW_BOOKING_LABEL,
} from "./reservation-import-copy";
import type { ReservationImportConflictResolutionDto } from "@/lib/admin/reservation-import-api";
import { ReservationImportDraftPreviewTable } from "./ReservationImportDraftPreviewTable";
import { ReservationImportRejectedRowCard } from "./ReservationImportRejectedRowCard";
import { ReservationImportReviewRowCard } from "./ReservationImportReviewRowCard";
import { evaluateClientCommitEligibility } from "./reservation-import-commit-eligibility";
import {
  bookingDrawerHref,
  collectCreatedBookingIds,
  computeReadinessCounts,
  countEligibleUnresolvedPrices,
  filterRowsForTab,
  tabCounts,
  type ReviewTabId,
} from "./reservation-import-review-utils";
import { useReservationImportReview } from "./useReservationImportReview";

/**
 * B3.3 review + Phase C2 commit — conflicts, pricing, atomic whole-batch commit.
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
    committing,
    lastCommitSummary,
    decidingRowId,
    pricingRowId,
    pricingBatch,
    decisionBusy,
    refetchFailed,
    refetch,
    recheck,
    discard,
    commit,
    decideConflict,
    setRowPrice,
    setMissingPriceStrategy,
    reload,
  } = useReservationImportReview(tenantId, batchId);

  const [discardOpen, setDiscardOpen] = useState(false);
  const [changeFileOpen, setChangeFileOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
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
  const isCompleted = batch.status === "completed";
  const counts = computeReadinessCounts(rows, rejectedRows);
  const tabs = tabCounts(rows, rejectedRows);
  const unresolvedEligible = countEligibleUnresolvedPrices(rows);
  const commitGate = evaluateClientCommitEligibility(detail, {
    refetchFailed,
    mutationBusy: decisionBusy,
  });
  const canCommit = !isCompleted && commitGate.kind === "eligible";
  const previewCounts = commitGate.counts;

  async function handleDiscard(destination: "bookings" | "import" = "bookings") {
    const ok = await discard();
    if (ok) {
      toastSuccess(RESERVATION_IMPORT_DISCARD_SUCCESS);
      setDiscardOpen(false);
      setChangeFileOpen(false);
      router.push(
        destination === "import"
          ? "/dashboard/bookings/import"
          : "/dashboard/bookings",
      );
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

  async function handleCommit() {
    const result = await commit();
    setCommitOpen(false);
    if (result.ok) {
      toastSuccess(RESERVATION_IMPORT_COMMIT_SUCCESS);
      setLiveMessage(RESERVATION_IMPORT_COMMIT_SUCCESS);
      return;
    }
    if (result.phase === "stale") {
      toastError(RESERVATION_IMPORT_COMMIT_STALE_ERROR);
      setLiveMessage(RESERVATION_IMPORT_COMMIT_STALE_ERROR);
      setTab("action");
      return;
    }
    if (result.phase === "not_ready") {
      toastError(RESERVATION_IMPORT_COMMIT_NOT_READY_ERROR);
      setLiveMessage(RESERVATION_IMPORT_COMMIT_NOT_READY_ERROR);
      setTab("action");
      return;
    }
    if (result.phase === "refetch") {
      toastError(RESERVATION_IMPORT_COMMIT_REFETCH_ERROR);
      setLiveMessage(RESERVATION_IMPORT_COMMIT_REFETCH_ERROR);
      return;
    }
    if (result.phase === "expired" || result.phase === "not_found") {
      return;
    }
    toastError(RESERVATION_IMPORT_COMMIT_ERROR);
    setLiveMessage(RESERVATION_IMPORT_COMMIT_ERROR);
  }

  async function handleDecideConflict(
    rowId: string,
    resolution: Exclude<ReservationImportConflictResolutionDto, "undecided">,
  ) {
    const result = await decideConflict(rowId, resolution);
    if (result.ok) {
      toastSuccess(RESERVATION_IMPORT_DECISION_SUCCESS);
      setLiveMessage(RESERVATION_IMPORT_DECISION_SUCCESS);
      return;
    }
    if (result.phase === "refetch") {
      toastError(RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR);
      setLiveMessage(RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR);
      return;
    }
    toastError(RESERVATION_IMPORT_DECISION_ERROR);
    setLiveMessage(RESERVATION_IMPORT_DECISION_ERROR);
  }

  async function handleUseTalosPrice(rowId: string) {
    const result = await setRowPrice(rowId, { priceSource: "talos_calculated" });
    if (result.ok) {
      toastSuccess(RESERVATION_IMPORT_PRICE_SUCCESS);
      setLiveMessage(RESERVATION_IMPORT_PRICE_SUCCESS);
      return;
    }
    if (result.phase === "refetch") {
      toastError(RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR);
      setLiveMessage(RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR);
      return;
    }
    toastError(RESERVATION_IMPORT_PRICE_ERROR);
    setLiveMessage(RESERVATION_IMPORT_PRICE_ERROR);
  }

  async function handleSaveManualPrice(rowId: string, amount: string, currency: string) {
    const result = await setRowPrice(rowId, {
      priceSource: "operator_entered",
      operatorTotalAmount: amount,
      operatorCurrency: currency,
    });
    if (result.ok) {
      toastSuccess(RESERVATION_IMPORT_PRICE_SUCCESS);
      setLiveMessage(RESERVATION_IMPORT_PRICE_SUCCESS);
      return;
    }
    if (result.phase === "refetch") {
      toastError(RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR);
      setLiveMessage(RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR);
      return;
    }
    toastError(RESERVATION_IMPORT_PRICE_ERROR);
    setLiveMessage(RESERVATION_IMPORT_PRICE_ERROR);
  }

  async function handleTalosAllMissing() {
    const result = await setMissingPriceStrategy();
    if (result.ok) {
      toastSuccess(RESERVATION_IMPORT_PRICE_BATCH_SUCCESS);
      setLiveMessage(RESERVATION_IMPORT_PRICE_BATCH_SUCCESS);
      return;
    }
    if (result.phase === "refetch") {
      toastError(RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR);
      setLiveMessage(RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR);
      return;
    }
    toastError(RESERVATION_IMPORT_PRICE_BATCH_ERROR);
    setLiveMessage(RESERVATION_IMPORT_PRICE_BATCH_ERROR);
  }

  const completedImported =
    lastCommitSummary?.imported ??
    rows.filter((r) => r.status === "imported").length;
  const completedSkipped =
    lastCommitSummary?.skipped ??
    rows.filter(
      (r) =>
        r.status === "skipped_already_imported" ||
        (r.status === "skipped" && r.processedAt != null),
    ).length;
  const completedSuperseded =
    lastCommitSummary?.supersededBookingIds.length ??
    previewCounts.replacementBookingCount;
  const completedRejected = rejectedRows.length;
  const createdBookingIds = collectCreatedBookingIds({
    summaryIds: lastCommitSummary?.createdBookingIds,
    rows,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-8">
      <div aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      <PageHeader
        title={
          isCompleted ? RESERVATION_IMPORT_COMPLETED_TITLE : RESERVATION_IMPORT_REVIEW_TITLE
        }
        description={batch.filename || "import.csv"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/bookings">{elCommon.back}</Link>
            </Button>
            {!isCompleted ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rechecking || refreshing || committing}
                  onClick={() => void handleRecheck()}
                >
                  {rechecking ? "Επανέλεγχος…" : RESERVATION_IMPORT_RECHECK_LABEL}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={committing || discarding}
                  onClick={() => setChangeFileOpen(true)}
                  data-testid="import-draft-change-file"
                >
                  {RESERVATION_IMPORT_CHANGE_FILE_LABEL}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={committing || discarding}
                  onClick={() => setDiscardOpen(true)}
                >
                  Απόρριψη
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      {!isCompleted ? (
        <Surface variant="attention" padding="sm">
          <p className="text-sm text-foreground" role="status">
            {RESERVATION_IMPORT_DRAFT_TTL_MESSAGE}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Λήγει: {formatOperatorDateTime(batch.expiresAt)}
          </p>
        </Surface>
      ) : null}

      {isCompleted ? (
        <Surface variant="panel" padding="md" className="space-y-4">
          <SurfaceHeader
            title={RESERVATION_IMPORT_COMPLETED_TITLE}
            description="Η πρόχειρη εισαγωγή ολοκληρώθηκε και δεν μπορεί να τροποποιηθεί."
          />
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {elCommon.status}
              </dt>
              <dd className="mt-0.5">
                <StatusBadge status={batch.status} label="Ολοκληρωμένη" />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Ολοκληρώθηκε
              </dt>
              <dd className="mt-0.5">
                {batch.committedAt
                  ? formatOperatorDateTime(batch.committedAt)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Εισήχθησαν
              </dt>
              <dd className="mt-0.5 font-medium">{completedImported}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Παραλείφθηκαν
              </dt>
              <dd className="mt-0.5 font-medium">{completedSkipped}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Αντικαταστάσεις
              </dt>
              <dd className="mt-0.5 font-medium">{completedSuperseded}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Απορριφθείσες
              </dt>
              <dd className="mt-0.5 font-medium">{completedRejected}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Νέες κρατήσεις
              </dt>
              <dd className="mt-0.5 font-medium">
                {createdBookingIds.length > 0
                  ? createdBookingIds.length
                  : completedImported}
              </dd>
            </div>
          </dl>

          {createdBookingIds.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {RESERVATION_IMPORT_CREATED_BOOKINGS_TITLE}
              </p>
              <ul className="flex flex-col gap-1">
                {createdBookingIds.map((bookingId, index) => (
                  <li key={bookingId}>
                    <Link
                      href={bookingDrawerHref(bookingId)}
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      {RESERVATION_IMPORT_VIEW_BOOKING_LABEL}
                      {createdBookingIds.length > 1 ? ` #${index + 1}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Button size="sm" asChild>
            <Link href="/dashboard/bookings">{RESERVATION_IMPORT_BACK_TO_BOOKINGS}</Link>
          </Button>
        </Surface>
      ) : (
        <Surface variant="panel" padding="md" className="space-y-4">
          <SurfaceHeader
            title="Προεπισκόπηση κρατήσεων"
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

          <ReservationImportDraftPreviewTable
            rows={rows}
            rejectedRows={rejectedRows}
            counts={counts}
            unitLabel={unitLabel}
          />

          {unresolvedEligible > 0 ? (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <p className="text-sm text-muted-foreground">
                {RESERVATION_IMPORT_USE_TALOS_ALL_MISSING_HINT}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={decisionBusy || pricingBatch}
                onClick={() => void handleTalosAllMissing()}
              >
                {pricingBatch
                  ? "Εφαρμογή…"
                  : RESERVATION_IMPORT_USE_TALOS_ALL_MISSING_LABEL}
              </Button>
            </div>
          ) : null}

          <div
            className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-4"
            data-testid="import-confirm-panel"
          >
            <h3 className="text-sm font-medium">{RESERVATION_IMPORT_FINAL_SUMMARY_TITLE}</h3>
            <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
              <li>
                Προς εισαγωγή:{" "}
                <strong className="text-foreground">{previewCounts.importCount}</strong>
              </li>
              <li>
                Προς παράλειψη:{" "}
                <strong className="text-foreground">{previewCounts.skipCount}</strong>
              </li>
              <li>
                Απορριφθείσες:{" "}
                <strong className="text-foreground">{previewCounts.rejectedCount}</strong>
              </li>
              <li>
                Αντικαταστάσεις υπαρχουσών:{" "}
                <strong className="text-foreground">
                  {previewCounts.replacementBookingCount}
                </strong>
              </li>
            </ul>

            {commitGate.kind === "blocked" ? (
              <p className="text-sm text-amber-800 dark:text-amber-200" role="status">
                {commitGate.message}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={!canCommit}
                onClick={() => setCommitOpen(true)}
                data-testid="import-commit-reservations"
              >
                {committing
                  ? RESERVATION_IMPORT_COMMIT_BUSY_LABEL
                  : RESERVATION_IMPORT_COMMIT_LABEL}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={committing || discarding}
                onClick={() => setChangeFileOpen(true)}
              >
                {RESERVATION_IMPORT_CHANGE_FILE_LABEL}
              </Button>
            </div>
          </div>
        </Surface>
      )}

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
                    decidingRowId={isCompleted ? null : decidingRowId}
                    pricingRowId={isCompleted ? null : pricingRowId}
                    decisionBusy={isCompleted || decisionBusy}
                    onDecideConflict={handleDecideConflict}
                    onUseTalosPrice={handleUseTalosPrice}
                    onSaveManualPrice={handleSaveManualPrice}
                  />
                ))
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {refetchFailed ? (
        <Surface variant="attention" padding="sm" className="space-y-2">
          <p className="text-sm text-foreground" role="alert">
            {RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={refreshing}
            onClick={() => void refetch()}
          >
            Ανανέωση από τον διακομιστή
          </Button>
        </Surface>
      ) : null}

      {refreshing ? (
        <p className="text-xs text-muted-foreground" role="status">
          Ανανέωση από τον διακομιστή…
        </p>
      ) : null}

      {!isCompleted ? (
        <>
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
            onConfirm={() => void handleDiscard("bookings")}
          />
          <ConfirmDialog
            open={changeFileOpen}
            onOpenChange={(open) => {
              if (!open && !discarding) setChangeFileOpen(false);
            }}
            title={RESERVATION_IMPORT_CHANGE_FILE_LABEL}
            description="Θα απορριφθεί η τρέχουσα πρόχειρη εισαγωγή χωρίς δημιουργία κρατήσεων, ώστε να ανεβάσετε άλλο αρχείο CSV."
            confirmLabel={RESERVATION_IMPORT_CHANGE_FILE_LABEL}
            destructive
            loading={discarding}
            onConfirm={() => void handleDiscard("import")}
          />
          <ConfirmDialog
            open={commitOpen}
            onOpenChange={(open) => {
              if (!open && !committing) setCommitOpen(false);
            }}
            title={RESERVATION_IMPORT_COMMIT_CONFIRM_TITLE}
            description={RESERVATION_IMPORT_COMMIT_CONFIRM_BODY(
              previewCounts.importCount,
              previewCounts.skipCount,
              previewCounts.replacementBookingCount,
            )}
            confirmLabel={RESERVATION_IMPORT_COMMIT_LABEL}
            loading={committing}
            onConfirm={handleCommit}
          />
        </>
      ) : null}
    </div>
  );
}

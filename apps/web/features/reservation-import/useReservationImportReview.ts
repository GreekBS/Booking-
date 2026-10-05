"use client";

import { useCallback, useEffect, useState } from "react";
import {
  discardReservationImportDraft,
  getReservationImportDraft,
  isReservationImportCommitNotReadyError,
  isReservationImportExpiredError,
  isReservationImportNotFoundError,
  isReservationImportStaleCommitError,
  commitReservationImportDraft,
  recheckReservationImportDraft,
  updateReservationImportMissingPriceStrategy,
  updateReservationImportRowDecision,
  type ReservationImportConflictResolutionDto,
  type ReservationImportDraftDetail,
  type ReservationImportPriceSourceDto,
  type ReservationImportCommitSummaryDto,
} from "@/lib/admin/reservation-import-api";
import {
  fetchPropertyUnitCatalog,
  flattenCatalogUnits,
  invalidatePropertyUnitCatalogCache,
} from "@/lib/admin/api";
import {
  RESERVATION_IMPORT_LOAD_DRAFT_ERROR,
  RESERVATION_IMPORT_MANUAL_CURRENCY_DEFAULT,
} from "./reservation-import-copy";

export type ReviewLoadState =
  | { kind: "loading" }
  | { kind: "ready"; detail: ReservationImportDraftDetail }
  | { kind: "expired" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export type MutationRefetchResult =
  | { ok: true }
  | { ok: false; phase: "patch" | "refetch" };

export type ConflictDecisionResult = MutationRefetchResult;
export type PriceDecisionResult = MutationRefetchResult;

export type CommitMutationResult =
  | {
      ok: true;
      alreadyCompleted: boolean;
      summary: ReservationImportCommitSummaryDto;
    }
  | {
      ok: false;
      phase: "commit" | "stale" | "not_ready" | "refetch" | "expired" | "not_found";
    };

export function useReservationImportReview(tenantId: string | null, batchId: string) {
  const [state, setState] = useState<ReviewLoadState>({ kind: "loading" });
  const [unitNameById, setUnitNameById] = useState<Map<string, string>>(new Map());
  const [catalogError, setCatalogError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [lastCommitSummary, setLastCommitSummary] =
    useState<ReservationImportCommitSummaryDto | null>(null);
  const [decidingRowId, setDecidingRowId] = useState<string | null>(null);
  const [pricingRowId, setPricingRowId] = useState<string | null>(null);
  const [pricingBatch, setPricingBatch] = useState(false);
  const [refetchFailed, setRefetchFailed] = useState(false);

  const loadCatalog = useCallback(async (tid: string) => {
    try {
      setCatalogError(false);
      const catalog = await fetchPropertyUnitCatalog(tid);
      const map = new Map<string, string>();
      for (const u of flattenCatalogUnits(catalog)) {
        map.set(u.id, u.name);
      }
      setUnitNameById(map);
    } catch {
      setCatalogError(true);
      setUnitNameById(new Map());
    }
  }, []);

  const refetch = useCallback(async (): Promise<boolean> => {
    if (!tenantId || !batchId) return false;
    setRefreshing(true);
    try {
      const detail = await getReservationImportDraft(tenantId, batchId);
      setState({ kind: "ready", detail });
      setRefetchFailed(false);
      return true;
    } catch (error) {
      if (isReservationImportExpiredError(error)) {
        setState({ kind: "expired" });
        setRefetchFailed(false);
        return false;
      }
      if (isReservationImportNotFoundError(error)) {
        setState({ kind: "not_found" });
        setRefetchFailed(false);
        return false;
      }
      setRefetchFailed(true);
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [tenantId, batchId]);

  const load = useCallback(async () => {
    if (!tenantId || !batchId) return;
    setState({ kind: "loading" });
    setRefetchFailed(false);
    try {
      const detail = await getReservationImportDraft(tenantId, batchId);
      setState({ kind: "ready", detail });
      void loadCatalog(tenantId);
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
  }, [tenantId, batchId, loadCatalog]);

  useEffect(() => {
    void load();
  }, [load]);

  const recheck = useCallback(async (): Promise<boolean> => {
    if (!tenantId || !batchId) return false;
    setRechecking(true);
    try {
      await recheckReservationImportDraft(tenantId, batchId);
      return await refetch();
    } catch {
      return false;
    } finally {
      setRechecking(false);
    }
  }, [tenantId, batchId, refetch]);

  const discard = useCallback(async (): Promise<boolean> => {
    if (!tenantId || !batchId) return false;
    setDiscarding(true);
    try {
      await discardReservationImportDraft(tenantId, batchId);
      invalidatePropertyUnitCatalogCache(tenantId);
      return true;
    } catch {
      return false;
    } finally {
      setDiscarding(false);
    }
  }, [tenantId, batchId]);

  const decideConflict = useCallback(
    async (
      rowId: string,
      conflictResolution: Exclude<ReservationImportConflictResolutionDto, "undecided">,
    ): Promise<ConflictDecisionResult> => {
      if (!tenantId || !batchId) return { ok: false, phase: "patch" };
      setDecidingRowId(rowId);
      try {
        await updateReservationImportRowDecision(tenantId, batchId, rowId, {
          conflictResolution,
        });
      } catch {
        setDecidingRowId(null);
        return { ok: false, phase: "patch" };
      }

      try {
        const ok = await refetch();
        if (!ok) return { ok: false, phase: "refetch" };
        return { ok: true };
      } finally {
        setDecidingRowId(null);
      }
    },
    [tenantId, batchId, refetch],
  );

  const setRowPrice = useCallback(
    async (
      rowId: string,
      body: {
        priceSource: Extract<
          ReservationImportPriceSourceDto,
          "talos_calculated" | "operator_entered"
        >;
        operatorTotalAmount?: string | null;
        operatorCurrency?: string | null;
      },
    ): Promise<PriceDecisionResult> => {
      if (!tenantId || !batchId) return { ok: false, phase: "patch" };
      setPricingRowId(rowId);
      try {
        await updateReservationImportRowDecision(tenantId, batchId, rowId, {
          priceSource: body.priceSource,
          operatorTotalAmount: body.operatorTotalAmount,
          operatorCurrency:
            body.priceSource === "operator_entered"
              ? (body.operatorCurrency ?? RESERVATION_IMPORT_MANUAL_CURRENCY_DEFAULT)
              : body.operatorCurrency,
        });
      } catch {
        setPricingRowId(null);
        return { ok: false, phase: "patch" };
      }

      try {
        const ok = await refetch();
        if (!ok) return { ok: false, phase: "refetch" };
        return { ok: true };
      } finally {
        setPricingRowId(null);
      }
    },
    [tenantId, batchId, refetch],
  );

  const setMissingPriceStrategy = useCallback(async (): Promise<PriceDecisionResult> => {
    if (!tenantId || !batchId) return { ok: false, phase: "patch" };
    setPricingBatch(true);
    try {
      await updateReservationImportMissingPriceStrategy(
        tenantId,
        batchId,
        "talos_for_all_missing",
      );
    } catch {
      setPricingBatch(false);
      return { ok: false, phase: "patch" };
    }

    try {
      const ok = await refetch();
      if (!ok) return { ok: false, phase: "refetch" };
      return { ok: true };
    } finally {
      setPricingBatch(false);
    }
  }, [tenantId, batchId, refetch]);

  const commit = useCallback(async (): Promise<CommitMutationResult> => {
    if (!tenantId || !batchId) return { ok: false, phase: "commit" };
    setCommitting(true);
    try {
      const response = await commitReservationImportDraft(tenantId, batchId);
      setLastCommitSummary(response.summary);
      const ok = await refetch();
      if (!ok) {
        // Commit may have succeeded — surface payload so UI is not empty.
        setState({
          kind: "ready",
          detail: {
            batch: response.batch,
            rows: response.rows,
            rejectedRows: [],
            conflictBookings: [],
          },
        });
        return { ok: false, phase: "refetch" };
      }
      return {
        ok: true,
        alreadyCompleted: response.alreadyCompleted,
        summary: response.summary,
      };
    } catch (error) {
      if (isReservationImportExpiredError(error)) {
        setState({ kind: "expired" });
        return { ok: false, phase: "expired" };
      }
      if (isReservationImportNotFoundError(error)) {
        setState({ kind: "not_found" });
        return { ok: false, phase: "not_found" };
      }
      if (isReservationImportStaleCommitError(error)) {
        try {
          await recheckReservationImportDraft(tenantId, batchId);
        } catch {
          // Recheck best-effort; still refetch below.
        }
        await refetch();
        return { ok: false, phase: "stale" };
      }
      if (isReservationImportCommitNotReadyError(error)) {
        await refetch();
        return { ok: false, phase: "not_ready" };
      }
      return { ok: false, phase: "commit" };
    } finally {
      setCommitting(false);
    }
  }, [tenantId, batchId, refetch]);

  function unitLabel(unitId: string): string {
    if (unitNameById.has(unitId)) return unitNameById.get(unitId)!;
    return `Μονάδα ${unitId.slice(0, 8)}…`;
  }

  const pricingBusy = pricingRowId !== null || pricingBatch;
  const decisionBusy =
    decidingRowId !== null ||
    pricingBusy ||
    refreshing ||
    rechecking ||
    committing;

  return {
    state,
    unitLabel,
    catalogError,
    refreshing,
    rechecking,
    discarding,
    committing,
    lastCommitSummary,
    decidingRowId,
    pricingRowId,
    pricingBatch,
    decisionBusy,
    pricingBusy,
    refetchFailed,
    refetch,
    recheck,
    discard,
    commit,
    decideConflict,
    setRowPrice,
    setMissingPriceStrategy,
    reload: load,
  };
}

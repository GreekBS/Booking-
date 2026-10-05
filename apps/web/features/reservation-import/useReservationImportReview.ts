"use client";

import { useCallback, useEffect, useState } from "react";
import {
  discardReservationImportDraft,
  getReservationImportDraft,
  isReservationImportExpiredError,
  isReservationImportNotFoundError,
  recheckReservationImportDraft,
  updateReservationImportRowDecision,
  type ReservationImportConflictResolutionDto,
  type ReservationImportDraftDetail,
} from "@/lib/admin/reservation-import-api";
import {
  fetchPropertyUnitCatalog,
  flattenCatalogUnits,
  invalidatePropertyUnitCatalogCache,
} from "@/lib/admin/api";
import { RESERVATION_IMPORT_LOAD_DRAFT_ERROR } from "./reservation-import-copy";

export type ReviewLoadState =
  | { kind: "loading" }
  | { kind: "ready"; detail: ReservationImportDraftDetail }
  | { kind: "expired" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

export type ConflictDecisionResult =
  | { ok: true }
  | { ok: false; phase: "patch" | "refetch" };

export function useReservationImportReview(tenantId: string | null, batchId: string) {
  const [state, setState] = useState<ReviewLoadState>({ kind: "loading" });
  const [unitNameById, setUnitNameById] = useState<Map<string, string>>(new Map());
  const [catalogError, setCatalogError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [decidingRowId, setDecidingRowId] = useState<string | null>(null);
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
      // Keep previous ready detail if present; do not invent success.
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

  function unitLabel(unitId: string): string {
    if (unitNameById.has(unitId)) return unitNameById.get(unitId)!;
    return `Μονάδα ${unitId.slice(0, 8)}…`;
  }

  return {
    state,
    unitLabel,
    catalogError,
    refreshing,
    rechecking,
    discarding,
    decidingRowId,
    decisionBusy: decidingRowId !== null || refreshing,
    refetchFailed,
    refetch,
    recheck,
    discard,
    decideConflict,
    reload: load,
  };
}

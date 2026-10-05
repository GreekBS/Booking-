"use client";

import { useCallback, useEffect, useState } from "react";
import {
  discardReservationImportDraft,
  getReservationImportDraft,
  isReservationImportExpiredError,
  isReservationImportNotFoundError,
  recheckReservationImportDraft,
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

export function useReservationImportReview(tenantId: string | null, batchId: string) {
  const [state, setState] = useState<ReviewLoadState>({ kind: "loading" });
  const [unitNameById, setUnitNameById] = useState<Map<string, string>>(new Map());
  const [catalogError, setCatalogError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [discarding, setDiscarding] = useState(false);

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

  const refetch = useCallback(async () => {
    if (!tenantId || !batchId) return;
    setRefreshing(true);
    try {
      const detail = await getReservationImportDraft(tenantId, batchId);
      setState({ kind: "ready", detail });
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
    } finally {
      setRefreshing(false);
    }
  }, [tenantId, batchId]);

  const load = useCallback(async () => {
    if (!tenantId || !batchId) return;
    setState({ kind: "loading" });
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
      await refetch();
      return true;
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

  function unitLabel(unitId: string): string {
    if (unitNameById.has(unitId)) return unitNameById.get(unitId)!;
    if (catalogError) return `Μονάδα ${unitId.slice(0, 8)}…`;
    return `Μονάδα ${unitId.slice(0, 8)}…`;
  }

  return {
    state,
    unitLabel,
    catalogError,
    refreshing,
    rechecking,
    discarding,
    refetch,
    recheck,
    discard,
    reload: load,
  };
}

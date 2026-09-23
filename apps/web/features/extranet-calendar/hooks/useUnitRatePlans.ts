"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchUnitsRatePlansBatch,
  invalidateRatePlansBatchCache,
} from "@/lib/admin/api";
import type { RatePlanRecord } from "@/lib/admin/types";

/**
 * Batched rate plans for visible units.
 * Toggling overlay modes does not refetch; new unitIds or refresh do.
 */
export function useUnitRatePlans(
  tenantId: string | null,
  unitIds: string[],
  loadRequested: boolean,
) {
  const [ratePlansByUnit, setRatePlansByUnit] = useState<
    Record<string, RatePlanRecord | null>
  >({});
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const stickyLoadRef = useRef(false);

  if (loadRequested) {
    stickyLoadRef.current = true;
  }

  const shouldLoad = stickyLoadRef.current;
  const unitKey = unitIds.join(",");

  const refreshRatePlans = useCallback(() => {
    if (tenantId) invalidateRatePlansBatchCache(tenantId);
    setRatePlansByUnit({});
    setRefreshToken((t) => t + 1);
  }, [tenantId]);

  const patchRatePlanForUnit = useCallback((unitId: string, plan: RatePlanRecord) => {
    setRatePlansByUnit((prev) => ({ ...prev, [unitId]: plan }));
  }, []);

  useEffect(() => {
    if (!tenantId || !shouldLoad || unitIds.length === 0) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await fetchUnitsRatePlansBatch(tenantId!, unitIds);
        if (!cancelled) setRatePlansByUnit(data);
      } catch {
        if (!cancelled) {
          const empty: Record<string, RatePlanRecord | null> = {};
          for (const id of unitIds) empty[id] = null;
          setRatePlansByUnit(empty);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, unitKey, shouldLoad, refreshToken, unitIds]);

  const loadingRatePlans: Record<string, boolean> = {};
  if (loading) {
    for (const id of unitIds) loadingRatePlans[id] = true;
  }

  return {
    ratePlansByUnit,
    loadingRatePlans,
    refreshRatePlans,
    patchRatePlanForUnit,
  };
}

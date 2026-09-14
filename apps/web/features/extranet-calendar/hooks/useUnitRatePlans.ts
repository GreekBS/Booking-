"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRatePlan } from "@/lib/admin/api";
import type { RatePlanRecord } from "@/lib/admin/types";

const CONCURRENCY = 4;

/**
 * Loads rate plans for visible units once requested, then caches in memory.
 * Toggling overlay modes does not trigger refetch; only new unitIds or refresh do.
 */
export function useUnitRatePlans(
  tenantId: string | null,
  unitIds: string[],
  loadRequested: boolean,
) {
  const [ratePlansByUnit, setRatePlansByUnit] = useState<Record<string, RatePlanRecord | null>>({});
  const [loadingUnits, setLoadingUnits] = useState<Record<string, boolean>>({});
  const [refreshToken, setRefreshToken] = useState(0);
  const stickyLoadRef = useRef(false);
  const loadedUnitsRef = useRef<Set<string>>(new Set());
  const inflightRef = useRef<Set<string>>(new Set());

  if (loadRequested) {
    stickyLoadRef.current = true;
  }

  const shouldLoad = stickyLoadRef.current;
  const unitKey = unitIds.join(",");

  const refreshRatePlans = useCallback(() => {
    loadedUnitsRef.current.clear();
    inflightRef.current.clear();
    setRatePlansByUnit({});
    setRefreshToken((t) => t + 1);
  }, []);

  const patchRatePlanForUnit = useCallback((unitId: string, plan: RatePlanRecord) => {
    loadedUnitsRef.current.add(unitId);
    setRatePlansByUnit((prev) => ({ ...prev, [unitId]: plan }));
  }, []);

  useEffect(() => {
    if (!tenantId || !shouldLoad || unitIds.length === 0) return;

    let cancelled = false;
    const pending = unitIds.filter(
      (id) => !loadedUnitsRef.current.has(id) && !inflightRef.current.has(id),
    );
    if (pending.length === 0) return;

    const queue = [...pending];
    let active = 0;

    async function loadOne(unitId: string) {
      inflightRef.current.add(unitId);
      setLoadingUnits((prev) => ({ ...prev, [unitId]: true }));
      try {
        const plan = await fetchRatePlan(tenantId!, unitId);
        if (!cancelled) {
          loadedUnitsRef.current.add(unitId);
          setRatePlansByUnit((prev) => ({ ...prev, [unitId]: plan }));
        }
      } catch {
        if (!cancelled) {
          loadedUnitsRef.current.add(unitId);
          setRatePlansByUnit((prev) => ({ ...prev, [unitId]: null }));
        }
      } finally {
        inflightRef.current.delete(unitId);
        if (!cancelled) {
          setLoadingUnits((prev) => ({ ...prev, [unitId]: false }));
        }
      }
    }

    async function pump() {
      while (queue.length > 0 && !cancelled) {
        if (active >= CONCURRENCY) {
          await new Promise((r) => setTimeout(r, 40));
          continue;
        }
        const unitId = queue.shift()!;
        active += 1;
        void loadOne(unitId).finally(() => {
          active -= 1;
        });
      }
    }

    void pump();

    return () => {
      cancelled = true;
    };
  }, [tenantId, unitKey, shouldLoad, refreshToken, unitIds]);

  return {
    ratePlansByUnit,
    loadingRatePlans: loadingUnits,
    refreshRatePlans,
    patchRatePlanForUnit,
  };
}

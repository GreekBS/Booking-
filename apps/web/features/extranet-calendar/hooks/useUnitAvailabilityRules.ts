"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchUnitsAvailabilityRulesBatch,
  invalidateAvailabilityRulesBatchCache,
} from "@/lib/admin/api";
import type { AvailabilityRulesRecord } from "@/lib/admin/types";

/**
 * Batched availability rules for visible units — one HTTP call.
 */
export function useUnitAvailabilityRules(tenantId: string | null, unitIds: string[]) {
  const [rulesByUnit, setRulesByUnit] = useState<Record<string, AvailabilityRulesRecord>>({});
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const unitKey = unitIds.join(",");

  useEffect(() => {
    if (!tenantId || unitIds.length === 0) {
      setRulesByUnit({});
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await fetchUnitsAvailabilityRulesBatch(tenantId!, unitIds);
        if (!cancelled) setRulesByUnit(data);
      } catch {
        /* rules optional — cell defaults to available */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, unitKey, unitIds, refreshToken]);

  const patchRulesForUnit = useCallback(
    (unitId: string, rules: AvailabilityRulesRecord) => {
      setRulesByUnit((prev) => ({ ...prev, [unitId]: rules }));
      if (tenantId) invalidateAvailabilityRulesBatchCache(tenantId);
    },
    [tenantId],
  );

  const refreshRules = useCallback(() => {
    if (tenantId) invalidateAvailabilityRulesBatchCache(tenantId);
    setRefreshToken((t) => t + 1);
  }, [tenantId]);

  return { rulesByUnit, loadingRules: loading, patchRulesForUnit, refreshRules };
}

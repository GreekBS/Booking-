"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAvailabilityRules } from "@/lib/admin/api";
import type { AvailabilityRulesRecord } from "@/lib/admin/types";

const CONCURRENCY = 4;

export function useUnitAvailabilityRules(tenantId: string | null, unitIds: string[]) {
  const [rulesByUnit, setRulesByUnit] = useState<Record<string, AvailabilityRulesRecord>>({});
  const [loading, setLoading] = useState(false);

  const unitKey = unitIds.join(",");

  useEffect(() => {
    if (!tenantId || unitIds.length === 0) {
      setRulesByUnit({});
      return;
    }

    let cancelled = false;
    const queue = [...unitIds];
    let active = 0;

    async function loadOne(unitId: string) {
      try {
        const rules = await fetchAvailabilityRules(tenantId!, unitId);
        if (!cancelled) {
          setRulesByUnit((prev) => ({ ...prev, [unitId]: rules }));
        }
      } catch {
        /* rules optional — cell defaults to available */
      }
    }

    async function pump() {
      setLoading(true);
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
      while (active > 0 && !cancelled) {
        await new Promise((r) => setTimeout(r, 40));
      }
      if (!cancelled) setLoading(false);
    }

    void pump();
    return () => {
      cancelled = true;
    };
  }, [tenantId, unitKey, unitIds]);

  const patchRulesForUnit = useCallback((unitId: string, rules: AvailabilityRulesRecord) => {
    setRulesByUnit((prev) => ({ ...prev, [unitId]: rules }));
  }, []);

  return { rulesByUnit, loadingRules: loading, patchRulesForUnit };
}

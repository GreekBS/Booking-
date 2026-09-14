"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchUnitCalendar, invalidateUnitCalendarCache } from "@/lib/admin/api";
import type { CalendarRecord } from "@/lib/admin/types";

const CONCURRENCY = 4;

export function useUnitCalendars(
  tenantId: string | null,
  unitIds: string[],
  rangeStart: string,
  rangeEnd: string,
) {
  const [calendarsByUnit, setCalendarsByUnit] = useState<Record<string, CalendarRecord>>({});
  const [loadingUnits, setLoadingUnits] = useState<Record<string, boolean>>({});
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const unitKey = unitIds.join(",");
  const rangeKey = `${rangeStart}:${rangeEnd}`;

  const refreshCalendars = useCallback(() => {
    if (tenantId) invalidateUnitCalendarCache(tenantId);
    setRefreshToken((t) => t + 1);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || unitIds.length === 0) return;

    let cancelled = false;
    const queue = [...unitIds];
    let active = 0;

    async function loadOne(unitId: string) {
      setLoadingUnits((prev) => ({ ...prev, [unitId]: true }));
      try {
        const data = await fetchUnitCalendar(tenantId!, unitId, rangeStart, rangeEnd);
        if (!cancelled) {
          setCalendarsByUnit((prev) => ({ ...prev, [unitId]: data }));
          setLastUpdatedAt(Date.now());
        }
      } catch {
        if (!cancelled) {
          setCalendarsByUnit((prev) => ({
            ...prev,
            [unitId]: prev[unitId] ?? { blocks: [], holds: [], bookings: [] },
          }));
        }
      } finally {
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
  }, [tenantId, unitKey, rangeKey, rangeStart, rangeEnd, refreshToken]);

  const isRefreshing = useMemo(
    () => Object.values(loadingUnits).some(Boolean),
    [loadingUnits],
  );

  return { calendarsByUnit, loadingUnits, refreshCalendars, isRefreshing, lastUpdatedAt };
}

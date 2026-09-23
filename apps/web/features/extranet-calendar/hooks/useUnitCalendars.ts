"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchUnitsCalendarBatch,
  invalidateUnitCalendarCache,
} from "@/lib/admin/api";
import type { CalendarRecord } from "@/lib/admin/types";

/**
 * Loads calendars for all visible units in one batched request.
 * Date-range changes refetch once — never N× per unit.
 */
export function useUnitCalendars(
  tenantId: string | null,
  unitIds: string[],
  rangeStart: string,
  rangeEnd: string,
) {
  const [calendarsByUnit, setCalendarsByUnit] = useState<Record<string, CalendarRecord>>({});
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const unitKey = unitIds.join(",");
  const rangeKey = `${rangeStart}:${rangeEnd}`;

  const refreshCalendars = useCallback(() => {
    if (tenantId) invalidateUnitCalendarCache(tenantId);
    setRefreshToken((t) => t + 1);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || unitIds.length === 0) {
      setCalendarsByUnit({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await fetchUnitsCalendarBatch(
          tenantId!,
          unitIds,
          rangeStart,
          rangeEnd,
        );
        if (!cancelled) {
          setCalendarsByUnit(data);
          setLastUpdatedAt(Date.now());
        }
      } catch {
        if (!cancelled) {
          const empty: Record<string, CalendarRecord> = {};
          for (const id of unitIds) {
            empty[id] = { blocks: [], holds: [], bookings: [] };
          }
          setCalendarsByUnit(empty);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, unitKey, rangeKey, rangeStart, rangeEnd, refreshToken, unitIds]);

  const loadingUnits: Record<string, boolean> = {};
  if (loading) {
    for (const id of unitIds) loadingUnits[id] = true;
  }

  return {
    calendarsByUnit,
    loadingUnits,
    refreshCalendars,
    isRefreshing: loading,
    lastUpdatedAt,
  };
}

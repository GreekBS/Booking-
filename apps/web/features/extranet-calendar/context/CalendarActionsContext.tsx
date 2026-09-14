"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AvailabilityRulesRecord, CalendarRecord, RatePlanRecord } from "@/lib/admin/types";
import type { RackPropertyGroup } from "../types";

interface CalendarActionsContextValue {
  refreshCalendars: () => void;
  refreshRatePlans: () => void;
  calendarsByUnit: Record<string, CalendarRecord>;
  rulesByUnit: Record<string, AvailabilityRulesRecord>;
  ratePlansByUnit: Record<string, RatePlanRecord | null>;
  patchRulesForUnit: (unitId: string, rules: AvailabilityRulesRecord) => void;
  patchRatePlanForUnit: (unitId: string, plan: RatePlanRecord) => void;
  groups: RackPropertyGroup[];
}

const CalendarActionsContext = createContext<CalendarActionsContextValue | null>(null);

export function CalendarActionsProvider({
  children,
  refreshCalendars,
  refreshRatePlans,
  calendarsByUnit,
  rulesByUnit,
  ratePlansByUnit,
  patchRulesForUnit,
  patchRatePlanForUnit,
  groups,
}: CalendarActionsContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({
      refreshCalendars,
      refreshRatePlans,
      calendarsByUnit,
      rulesByUnit,
      ratePlansByUnit,
      patchRulesForUnit,
      patchRatePlanForUnit,
      groups,
    }),
    [
      refreshCalendars,
      refreshRatePlans,
      calendarsByUnit,
      rulesByUnit,
      ratePlansByUnit,
      patchRulesForUnit,
      patchRatePlanForUnit,
      groups,
    ],
  );

  return (
    <CalendarActionsContext.Provider value={value}>{children}</CalendarActionsContext.Provider>
  );
}

export function useCalendarActions() {
  const ctx = useContext(CalendarActionsContext);
  if (!ctx) {
    throw new Error("useCalendarActions must be used within CalendarActionsProvider");
  }
  return ctx;
}

export function findUnitMeta(groups: RackPropertyGroup[], unitId: string) {
  for (const group of groups) {
    const unit = group.units.find((u) => u.unitId === unitId);
    if (unit) return unit;
  }
  return undefined;
}

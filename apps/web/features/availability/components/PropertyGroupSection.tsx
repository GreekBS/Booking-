"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PropertyRecord } from "@/lib/admin/types";
import { UNIT_COL_WIDTH_PX } from "../lib/calendar-utils";
import { computePropertySummary } from "../lib/property-summary";
import { occupancyHeatClass } from "../lib/occupancy";
import { UnitCalendarRow } from "./UnitCalendarRow";
import type { AvailabilityRulesRecord, CalendarRecord, RatePlanRecord } from "@/lib/admin/types";
import type { OverlayToggles } from "../types";

interface PropertyGroupSectionProps {
  property: PropertyRecord;
  dates: string[];
  today: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  unitSearch: string;
  overlays: OverlayToggles;
  calendars: Record<string, CalendarRecord>;
  loadingUnits: Record<string, boolean>;
  rulesByUnit: Record<string, AvailabilityRulesRecord>;
  ratesByUnit: Record<string, RatePlanRecord | null>;
}

export function PropertyGroupSection({
  property,
  dates,
  today,
  collapsed,
  onToggleCollapse,
  unitSearch,
  overlays,
  calendars,
  loadingUnits,
  rulesByUnit,
  ratesByUnit,
}: PropertyGroupSectionProps) {
  const search = unitSearch.trim().toLowerCase();
  const visibleUnits = property.units.filter(
    (u) => !search || u.name.toLowerCase().includes(search),
  );

  if (visibleUnits.length === 0 && search) {
    return null;
  }

  const summary = useMemo(
    () =>
      computePropertySummary(
        visibleUnits.map((u) => u.id),
        calendars,
        today,
        dates,
      ),
    [visibleUnits, calendars, today, dates],
  );

  const summaryParts: string[] = [
    `${summary.unitCount} unit${summary.unitCount !== 1 ? "s" : ""}`,
    `${summary.activeBookings} booking${summary.activeBookings !== 1 ? "s" : ""}`,
    `${summary.activeHolds} hold${summary.activeHolds !== 1 ? "s" : ""}`,
    `${summary.operatorBlocks} block${summary.operatorBlocks !== 1 ? "s" : ""}`,
  ];

  if (summary.occupancyPercent !== null) {
    summaryParts.push(`${summary.occupancyPercent}% occ (7d)`);
  }
  if (summary.upcomingArrivals > 0) {
    summaryParts.push(`${summary.upcomingArrivals} arr.`);
  }
  if (summary.upcomingDepartures > 0) {
    summaryParts.push(`${summary.upcomingDepartures} dep.`);
  }

  return (
    <div className="border-b border-border/80">
      <div className="flex border-b bg-muted/40 transition-colors hover:bg-muted/50">
        <div
          className="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r bg-muted/40 px-1.5 py-1.5"
          style={{ width: UNIT_COL_WIDTH_PX }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${property.name}` : `Collapse ${property.name}`}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold leading-tight tracking-tight">
              {property.name}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <span className="truncate text-[10px] text-muted-foreground">
                {summaryParts.join(" · ")}
              </span>
              {summary.occupancyPercent !== null && (
                <span
                  className={cn(
                    "hidden rounded px-1 py-px text-[9px] font-medium tabular-nums xl:inline",
                    occupancyHeatClass(summary.occupancyPercent),
                  )}
                >
                  {summary.occupancyPercent}%
                </span>
              )}
            </div>
          </div>
        </div>
        <div className={cn("flex-1", collapsed && "opacity-60")} />
      </div>

      {!collapsed &&
        visibleUnits.map((unit) => (
          <UnitCalendarRow
            key={unit.id}
            meta={{
              unitId: unit.id,
              unitName: unit.name,
              propertyId: property.id,
              propertyName: property.name,
            }}
            dates={dates}
            today={today}
            calendar={calendars[unit.id]}
            rules={rulesByUnit[unit.id]}
            ratePlan={ratesByUnit[unit.id]}
            loading={Boolean(loadingUnits[unit.id])}
            overlays={overlays}
          />
        ))}
    </div>
  );
}

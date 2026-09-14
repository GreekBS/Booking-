"use client";

import { useMemo } from "react";
import type { CalendarRecord } from "@/lib/admin/types";
import { cn } from "@/lib/utils";
import {
  computeUnitOccupancy,
  occupancyHeatClass,
} from "../lib/occupancy";

interface UnitOccupancyIndicatorProps {
  calendar: CalendarRecord | undefined;
  today: string;
  loadedDates: string[];
}

function OccChip({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-medium tabular-nums leading-none",
        occupancyHeatClass(value),
      )}
      title={`${label}: ${value}% occupied`}
    >
      <span className="opacity-70">{label}</span>
      <span>{value}%</span>
    </span>
  );
}

export function UnitOccupancyIndicator({
  calendar,
  today,
  loadedDates,
}: UnitOccupancyIndicatorProps) {
  const metrics = useMemo(
    () => computeUnitOccupancy(calendar, today, loadedDates),
    [calendar, today, loadedDates],
  );

  const hasAny =
    metrics.today !== null || metrics.next7 !== null || metrics.next30 !== null;

  if (!hasAny) return null;

  return (
    <div className="mt-0.5 flex flex-wrap gap-0.5">
      <OccChip label="T" value={metrics.today} />
      <OccChip label="7d" value={metrics.next7} />
      <OccChip label="30d" value={metrics.next30} />
    </div>
  );
}

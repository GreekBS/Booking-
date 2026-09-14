"use client";

import { buildCellHoverInfo } from "../lib/cell-hover-info";
import type { AvailabilityRulesRecord, CalendarRecord, RatePlanRecord } from "@/lib/admin/types";

interface CellHoverCardContentProps {
  date: string;
  unitName: string;
  propertyName: string;
  calendar: CalendarRecord | undefined;
  rules: AvailabilityRulesRecord | undefined;
  ratePlan: RatePlanRecord | null | undefined;
}

export function CellHoverCardContent({
  date,
  unitName,
  propertyName,
  calendar,
  rules,
  ratePlan,
}: CellHoverCardContentProps) {
  const info = buildCellHoverInfo(date, unitName, propertyName, calendar, rules, ratePlan);

  return (
    <div className="space-y-2 text-xs">
      <div>
        <p className="font-semibold">{info.dateLabel}</p>
        <p className="text-muted-foreground">
          {info.unitName} · {info.propertyName}
        </p>
      </div>
      <div className="rounded-sm bg-muted/50 px-2 py-1 capitalize">{info.stateLabel}</div>
      {info.priceLine && (
        <Row label="Price" value={info.priceLine} />
      )}
      {info.restrictionsLine && (
        <Row label="Rules" value={info.restrictionsLine} />
      )}
      {info.summaryLine && (
        <Row label="Summary" value={info.summaryLine} />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-right">{value}</span>
    </div>
  );
}

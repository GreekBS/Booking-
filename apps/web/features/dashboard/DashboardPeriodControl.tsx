"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  analyticsPeriodToSearchParams,
  resolveAnalyticsPeriod,
  shiftAnalyticsPeriod,
  type AnalyticsPeriodType,
  type AnalyticsPeriodWindow,
} from "@hcp/domain";

const PERIOD_OPTIONS: Array<{ type: AnalyticsPeriodType; label: string; url: string }> = [
  { type: "week", label: "Εβδομάδα", url: "week" },
  { type: "month", label: "Μήνας", url: "month" },
  { type: "quarter", label: "Τρίμηνο", url: "quarter" },
  { type: "half_year", label: "Εξάμηνο", url: "half" },
  { type: "year", label: "Έτος", url: "year" },
];

export function periodQueryFromSearchParams(
  searchParams: URLSearchParams,
): {
  period?: string;
  year?: string;
  month?: string;
  quarter?: string;
  half?: string;
  week?: string;
} {
  const period = searchParams.get("period") ?? undefined;
  return {
    period,
    year: searchParams.get("year") ?? undefined,
    month: searchParams.get("month") ?? undefined,
    quarter: searchParams.get("quarter") ?? undefined,
    half: searchParams.get("half") ?? undefined,
    week: searchParams.get("week") ?? undefined,
  };
}

export function hasAnalyticsPeriodParams(searchParams: URLSearchParams): boolean {
  return Boolean(
    searchParams.get("period") ||
      searchParams.get("year") ||
      searchParams.get("month") ||
      searchParams.get("quarter") ||
      searchParams.get("half") ||
      searchParams.get("week"),
  );
}

export function buildDashboardHref(
  window: AnalyticsPeriodWindow,
  propertyId?: string | null,
): string {
  const params = analyticsPeriodToSearchParams(window);
  if (propertyId) {
    // propertyId is typically via Active Property header, not URL — keep period only
  }
  const qs = params.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

type DashboardPeriodControlProps = {
  period: AnalyticsPeriodWindow;
  localToday: string;
  onChange: (next: AnalyticsPeriodWindow) => void;
};

export function DashboardPeriodControl({
  period,
  localToday,
  onChange,
}: DashboardPeriodControlProps) {
  function selectType(type: AnalyticsPeriodType) {
    const next = resolveAnalyticsPeriod(
      {
        period: type === "half_year" ? "half" : type,
        year: String(period.year),
        month: period.month != null ? String(period.month) : undefined,
        quarter: period.quarter != null ? String(period.quarter) : undefined,
        half: period.half != null ? String(period.half) : undefined,
        week: period.weekStart ?? period.startDate,
      },
      localToday,
    );
    // When switching type, re-anchor to local today for that granularity.
    const anchored = resolveAnalyticsPeriod(
      {
        period: type === "half_year" ? "half" : type,
      },
      localToday,
    );
    onChange(type === period.periodType ? next : anchored);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div
        className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/30 p-1"
        role="tablist"
        aria-label="Περίοδος ανάλυσης"
      >
        {PERIOD_OPTIONS.map((opt) => {
          const selected = period.periodType === opt.type;
          return (
            <button
              key={opt.type}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectType(opt.type)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-1 sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Προηγούμενη περίοδος"
          onClick={() => onChange(shiftAnalyticsPeriod(period, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div
          className="min-w-[9.5rem] text-center text-sm font-medium tabular-nums sm:min-w-[11rem]"
          aria-live="polite"
        >
          {period.displayLabel}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Επόμενη περίοδος"
          onClick={() => onChange(shiftAnalyticsPeriod(period, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

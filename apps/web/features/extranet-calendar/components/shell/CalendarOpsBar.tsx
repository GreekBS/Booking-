"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, LayoutDashboard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OPS_BAR_HEIGHT_PX } from "../../constants";
import type { CalendarDensity } from "../../lib/density";
import type { OverlayToggles } from "../../lib/overlay-types";
import { LEGEND_SWATCHES } from "../../lib/visual-theme";
import type { RackUnit } from "../../types";
import { cn } from "@/lib/utils";

const OVERLAY_BUTTONS: Array<{ key: keyof OverlayToggles; label: string }> = [
  { key: "price", label: "Price" },
  { key: "minStay", label: "Min" },
  { key: "maxStay", label: "Max" },
  { key: "cta", label: "CTA" },
  { key: "ctd", label: "CTD" },
];

/** Toolbar overlay toggles — set true to restore Price / Min / Max / CTA / CTD buttons. */
const SHOW_OVERLAY_TOOLBAR_CONTROLS = false;

interface CalendarOpsBarProps {
  /** Display-only Active Property name (global header is the switcher). */
  propertyName: string | null;
  /** Current period label, e.g. "September 2026". */
  periodLabel: string;
  units: RackUnit[];
  selectedUnitId: string | null;
  onSelectedUnitChange: (value: string) => void;
  density: CalendarDensity;
  onDensityChange: (value: CalendarDensity) => void;
  overlays: OverlayToggles;
  onOverlayToggle: (key: keyof OverlayToggles) => void;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  onToday: () => void;
  onRefresh: () => void;
  onOpenManualEdit?: () => void;
  isRefreshing?: boolean;
  lastUpdatedAt?: number | null;
  showLegend?: boolean;
}

export function CalendarOpsBar({
  propertyName,
  periodLabel,
  units,
  selectedUnitId,
  onSelectedUnitChange,
  density,
  onDensityChange,
  overlays,
  onOverlayToggle,
  onPrevPeriod,
  onNextPeriod,
  onToday,
  onRefresh,
  onOpenManualEdit,
  isRefreshing = false,
  lastUpdatedAt = null,
  showLegend = true,
}: CalendarOpsBarProps) {
  const freshnessLabel = (() => {
    if (isRefreshing) return "Refreshing…";
    if (!lastUpdatedAt) return null;
    const sec = Math.floor((Date.now() - lastUpdatedAt) / 1000);
    if (sec < 10) return "Just updated";
    if (sec < 60) return `Updated ${sec}s ago`;
    const min = Math.floor(sec / 60);
    return `Updated ${min}m ago`;
  })();

  return (
    <header
      className="flex shrink-0 flex-col border-b border-border bg-surface"
      style={{ minHeight: OPS_BAR_HEIGHT_PX }}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link href="/dashboard" title="Back to dashboard" aria-label="Back to dashboard">
            <LayoutDashboard className="h-4 w-4" />
          </Link>
        </Button>

        <div className="h-5 w-px shrink-0 bg-border" />

        <div className="min-w-0 shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Availability
          </p>
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">Calendar</p>
        </div>

        {propertyName ? (
          <span
            className="hidden h-8 max-w-[min(220px,30vw)] items-center truncate rounded-md border border-border bg-surface-subtle px-2.5 text-xs font-medium text-foreground sm:inline-flex"
            title={propertyName}
          >
            {propertyName}
          </span>
        ) : null}

        <div
          className="flex items-center gap-0.5"
          role="group"
          aria-label="Period navigation"
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onPrevPeriod}
            aria-label="Previous month"
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span
            className="min-w-[7.5rem] px-1 text-center text-xs font-semibold tabular-nums text-foreground sm:min-w-[9rem] sm:text-sm"
            aria-live="polite"
          >
            {periodLabel}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onNextPeriod}
            aria-label="Next month"
            title="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm" className="h-8 px-2.5 text-sm" onClick={onToday}>
          Today
        </Button>

        <Select
          value={selectedUnitId ?? undefined}
          onValueChange={onSelectedUnitChange}
          disabled={units.length === 0}
        >
          <SelectTrigger
            className="h-8 w-[min(200px,42vw)] text-sm font-medium"
            aria-label="Select unit"
          >
            <SelectValue placeholder="Select unit" />
          </SelectTrigger>
          <SelectContent>
            {units.map((unit) => (
              <SelectItem key={unit.unitId} value={unit.unitId}>
                {unit.unitName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {onOpenManualEdit ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-sm lg:hidden"
            onClick={onOpenManualEdit}
          >
            Edit dates
          </Button>
        ) : null}

        <div className="hidden items-center gap-0.5 sm:flex">
          <Button
            variant={density === "compact" ? "secondary" : "outline"}
            size="sm"
            className="h-8 px-2.5 text-xs"
            onClick={() => onDensityChange("compact")}
          >
            Compact
          </Button>
          <Button
            variant={density === "comfortable" ? "secondary" : "outline"}
            size="sm"
            className="h-8 px-2.5 text-xs"
            onClick={() => onDensityChange("comfortable")}
          >
            Comfortable
          </Button>
        </div>

        {SHOW_OVERLAY_TOOLBAR_CONTROLS ? (
          <>
            <div className="hidden h-5 w-px shrink-0 bg-border md:block" />
            <div
              className="hidden items-center gap-0.5 md:flex"
              role="group"
              aria-label="Cell overlays"
            >
              {OVERLAY_BUTTONS.map(({ key, label }) => (
                <Button
                  key={key}
                  variant={overlays[key] ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 px-2 text-[11px]"
                  onClick={() => onOverlayToggle(key)}
                  aria-pressed={overlays[key]}
                >
                  {label}
                </Button>
              ))}
            </div>
          </>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {freshnessLabel ? (
            <span
              className={cn(
                "hidden text-[10px] tabular-nums lg:inline",
                isRefreshing ? "text-primary" : "text-muted-foreground",
              )}
            >
              {freshnessLabel}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh (R)"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            <span className="hidden md:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {showLegend ? (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 bg-surface-subtle/40 px-3 py-1"
          aria-label="Calendar legend"
        >
          {LEGEND_SWATCHES.map((item) => (
            <span
              key={item.key}
              className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"
            >
              <span
                className={cn("inline-block size-2.5 shrink-0 rounded-sm", item.className)}
                aria-hidden
              />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </header>
  );
}

"use client";

import Link from "next/link";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatalogPropertyRecord } from "@/lib/admin/types";
import { OPS_BAR_HEIGHT_PX } from "../../constants";
import type { CalendarDensity } from "../../lib/density";
import type { OverlayToggles } from "../../lib/overlay-types";
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
  properties: CatalogPropertyRecord[];
  selectedPropertyId: string | null;
  onSelectedPropertyChange: (value: string) => void;
  units: RackUnit[];
  selectedUnitId: string | null;
  onSelectedUnitChange: (value: string) => void;
  density: CalendarDensity;
  onDensityChange: (value: CalendarDensity) => void;
  overlays: OverlayToggles;
  onOverlayToggle: (key: keyof OverlayToggles) => void;
  onToday: () => void;
  onRefresh: () => void;
  onOpenManualEdit?: () => void;
  isRefreshing?: boolean;
  lastUpdatedAt?: number | null;
}

export function CalendarOpsBar({
  properties,
  selectedPropertyId,
  onSelectedPropertyChange,
  units,
  selectedUnitId,
  onSelectedUnitChange,
  density,
  onDensityChange,
  overlays,
  onOverlayToggle,
  onToday,
  onRefresh,
  onOpenManualEdit,
  isRefreshing = false,
  lastUpdatedAt = null,
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
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#d1d5db] bg-white px-3 py-1 dark:border-border dark:bg-background"
      style={{ minHeight: OPS_BAR_HEIGHT_PX }}
    >
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
        <Link href="/dashboard" title="Back to dashboard">
          <LayoutDashboard className="h-4 w-4" />
        </Link>
      </Button>

      <div className="h-5 w-px shrink-0 bg-border" />

      <span className="hidden shrink-0 text-sm font-semibold tracking-tight sm:inline">Calendar</span>

      {properties.length === 1 ? (
        <span
          className="inline-flex h-8 max-w-[min(220px,28vw)] items-center truncate border border-[#d1d5db] bg-[#f9fafb] px-2.5 text-sm font-medium text-[#374151] dark:border-border dark:bg-muted/30 dark:text-foreground"
          title={properties[0]!.name}
        >
          {properties[0]!.name}
        </span>
      ) : (
        <Select
          value={selectedPropertyId ?? undefined}
          onValueChange={onSelectedPropertyChange}
        >
          <SelectTrigger className="h-8 w-[min(200px,28vw)] text-sm font-medium">
            <SelectValue placeholder="Select property" />
          </SelectTrigger>
          <SelectContent>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={selectedUnitId ?? undefined}
        onValueChange={onSelectedUnitChange}
        disabled={units.length === 0}
      >
        <SelectTrigger className="h-8 w-[min(200px,28vw)] text-sm font-medium">
          <SelectValue placeholder="Select room" />
        </SelectTrigger>
        <SelectContent>
          {units.map((unit) => (
            <SelectItem key={unit.unitId} value={unit.unitId}>
              {unit.unitName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" className="h-8 px-2.5 text-sm" onClick={onToday}>
        Today
      </Button>

      {onOpenManualEdit && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-sm lg:hidden"
          onClick={onOpenManualEdit}
        >
          Edit dates
        </Button>
      )}

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

      {SHOW_OVERLAY_TOOLBAR_CONTROLS && (
        <>
          <div className="hidden h-5 w-px shrink-0 bg-border md:block" />

          <div className="hidden items-center gap-0.5 md:flex" role="group" aria-label="Cell overlays">
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
      )}

      <div className="ml-auto flex items-center gap-2">
        {freshnessLabel && (
          <span
            className={cn(
              "hidden text-[10px] tabular-nums lg:inline",
              isRefreshing ? "text-primary" : "text-muted-foreground",
            )}
          >
            {freshnessLabel}
          </span>
        )}
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
    </header>
  );
}

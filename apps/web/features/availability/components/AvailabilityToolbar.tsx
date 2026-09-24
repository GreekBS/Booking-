"use client";

import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StickyToolbar } from "@/components/admin/sticky-toolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarLegend } from "./CalendarLegend";
import type { OverlayToggles } from "../types";

interface AvailabilityToolbarProps {
  unitSearch: string;
  onUnitSearchChange: (value: string) => void;
  rangeStart: string;
  onRangeStartChange: (value: string) => void;
  rangeDays: number;
  onRangeDaysChange: (value: number) => void;
  overlays: OverlayToggles;
  onOverlayChange: (key: keyof OverlayToggles, value: boolean) => void;
  onToday: () => void;
  onShiftRange: (days: number) => void;
  onRefresh: () => void;
  /** Optional read-only label for the active property (selection lives in header). */
  activePropertyName?: string | null;
}

const RANGE_PRESETS = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "Month" },
  { value: 35, label: "35 days" },
  { value: 42, label: "42 days" },
] as const;

const OVERLAY_BUTTONS: Array<{ key: keyof OverlayToggles; label: string }> = [
  { key: "price", label: "Price" },
  { key: "minStay", label: "Min stay" },
  { key: "maxStay", label: "Max stay" },
  { key: "cta", label: "CTA" },
  { key: "ctd", label: "CTD" },
];

export function AvailabilityToolbar({
  unitSearch,
  onUnitSearchChange,
  rangeStart,
  onRangeStartChange,
  rangeDays,
  onRangeDaysChange,
  overlays,
  onOverlayChange,
  onToday,
  onShiftRange,
  onRefresh,
  activePropertyName,
}: AvailabilityToolbarProps) {
  return (
    <StickyToolbar className="mb-3">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {activePropertyName ? (
              <span className="inline-flex h-8 max-w-[180px] items-center truncate rounded-md border bg-muted/40 px-2.5 text-xs font-medium">
                {activePropertyName}
              </span>
            ) : null}

            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={unitSearch}
                onChange={(e) => onUnitSearchChange(e.target.value)}
                placeholder="Search unit…"
                className="h-8 w-[140px] pl-7 text-xs"
                aria-label="Search unit"
              />
            </div>

            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onShiftRange(-7)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onShiftRange(7)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Input
              type="date"
              value={rangeStart}
              onChange={(e) => onRangeStartChange(e.target.value)}
              className="h-8 w-[130px] text-xs"
              aria-label="Range start"
            />
            <Select value={String(rangeDays)} onValueChange={(v) => onRangeDaysChange(Number(v))}>
              <SelectTrigger className="h-8 w-[100px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={String(preset.value)}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {OVERLAY_BUTTONS.map(({ key, label }) => (
              <Button
                key={key}
                variant={overlays[key] ? "secondary" : "outline"}
                size="sm"
                className="h-8 px-2.5 text-xs transition-colors"
                onClick={() => onOverlayChange(key, !overlays[key])}
              >
                {label}
              </Button>
            ))}
            <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs" onClick={onRefresh}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        <CalendarLegend compact />
      </div>
    </StickyToolbar>
  );
}

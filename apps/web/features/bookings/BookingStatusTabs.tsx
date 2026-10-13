"use client";

import { cn } from "@/lib/utils";
import { bookingStatusPluralLabelEl } from "@/lib/i18n";

export type BookingStatusTabId =
  | "all"
  | "pending"
  | "payment_pending"
  | "confirmed"
  | "completed"
  | "cancelled";

export interface BookingStatusTabCounts {
  all: number;
  pending: number;
  payment_pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
}

const TABS: Array<{
  id: BookingStatusTabId;
  label: string;
  tone?: "info" | "success" | "destructive" | "warning" | "muted";
}> = [
  { id: "all", label: "Όλες", tone: "muted" },
  { id: "confirmed", label: bookingStatusPluralLabelEl("confirmed"), tone: "info" },
  { id: "completed", label: bookingStatusPluralLabelEl("completed"), tone: "success" },
  { id: "cancelled", label: bookingStatusPluralLabelEl("cancelled"), tone: "destructive" },
  { id: "pending", label: bookingStatusPluralLabelEl("pending"), tone: "warning" },
  {
    id: "payment_pending",
    label: bookingStatusPluralLabelEl("payment_pending"),
    tone: "warning",
  },
];

const toneSelected: Record<string, string> = {
  muted: "border-foreground/20 bg-foreground text-background",
  info: "border-info/40 bg-info-subtle text-info",
  success: "border-success/40 bg-success-subtle text-success",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-warning/40 bg-warning-subtle text-warning-foreground",
};

interface BookingStatusTabsProps {
  value: BookingStatusTabId;
  counts: BookingStatusTabCounts;
  onChange: (tab: BookingStatusTabId) => void;
  disabled?: boolean;
}

export function BookingStatusTabs({
  value,
  counts,
  onChange,
  disabled,
}: BookingStatusTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Φίλτρο κατάστασης κράτησης"
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
    >
      {TABS.map((tab) => {
        const selected = value === tab.id;
        const count =
          tab.id === "all"
            ? counts.all
            : counts[tab.id as Exclude<BookingStatusTabId, "all">];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected
                ? toneSelected[tab.tone ?? "muted"]
                : "border-border bg-surface text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <span>{tab.label}</span>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                selected ? "bg-black/10 dark:bg-white/15" : "bg-muted text-muted-foreground",
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

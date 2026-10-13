"use client";

import { cn } from "@/lib/utils";
import { bookingStatusPluralLabelEl } from "@/lib/i18n";
import {
  VISIBLE_BOOKING_STATUS_TABS,
  type BookingStatusTabId,
} from "@/features/bookings/bookings-list-query";

export type { BookingStatusTabId };

export interface BookingStatusTabCounts {
  all: number;
  pending: number;
  payment_pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
}

type TabTone = "muted" | "info" | "success" | "destructive";

const TAB_META: Record<
  (typeof VISIBLE_BOOKING_STATUS_TABS)[number],
  { label: string; tone: TabTone }
> = {
  all: { label: "Όλες", tone: "muted" },
  confirmed: {
    label: bookingStatusPluralLabelEl("confirmed"),
    tone: "info",
  },
  completed: {
    label: bookingStatusPluralLabelEl("completed"),
    tone: "success",
  },
  cancelled: {
    label: bookingStatusPluralLabelEl("cancelled"),
    tone: "destructive",
  },
};

/**
 * Unselected: fully rounded colored pills (border + subtle tint + status text).
 * Colors stay visible when idle — no plain gray chrome for status tabs.
 */
const toneIdle: Record<TabTone, string> = {
  muted:
    "border-foreground/25 bg-muted/80 text-foreground hover:border-foreground/40 hover:bg-muted",
  info: "border-info/40 bg-info-subtle/70 text-info hover:border-info/55 hover:bg-info-subtle",
  success:
    "border-success/40 bg-success-subtle/70 text-success hover:border-success/55 hover:bg-success-subtle",
  destructive:
    "border-destructive/40 bg-destructive/10 text-destructive hover:border-destructive/55 hover:bg-destructive/15",
};

/**
 * Selected: soft rectangle, no decorative outline/ring/shadow.
 * Keep each tab's status color (Όλες stays slate — never inverse black).
 * Transparent border preserves width so selection does not shift layout.
 */
const toneSelected: Record<TabTone, string> = {
  muted: "border-transparent bg-muted text-foreground font-semibold",
  info: "border-transparent bg-info-subtle text-info font-semibold",
  success: "border-transparent bg-success-subtle text-success font-semibold",
  destructive: "border-transparent bg-destructive/15 text-destructive font-semibold",
};

const toneCountIdle: Record<TabTone, string> = {
  muted: "bg-foreground/10 text-foreground",
  info: "bg-info/15 text-info",
  success: "bg-success/15 text-success",
  destructive: "bg-destructive/15 text-destructive",
};

const toneCountSelected: Record<TabTone, string> = {
  muted: "bg-foreground/15 text-foreground",
  info: "bg-info/20 text-info",
  success: "bg-success/20 text-success",
  destructive: "bg-destructive/20 text-destructive",
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
      className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 md:flex-nowrap md:overflow-visible"
    >
      {VISIBLE_BOOKING_STATUS_TABS.map((id) => {
        const meta = TAB_META[id];
        const selected = value === id;
        const count = id === "all" ? counts.all : counts[id];
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-tone={meta.tone}
            data-selected={selected ? "true" : "false"}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 border px-3.5 text-sm font-medium transition-colors",
              // Idle = pill; selected = soft rectangle (shape is a non-color cue).
              selected ? "rounded-md" : "rounded-full",
              // Keyboard focus only — not a decorative selected chrome.
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected ? toneSelected[meta.tone] : toneIdle[meta.tone],
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <span className="whitespace-nowrap">{meta.label}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                selected ? toneCountSelected[meta.tone] : toneCountIdle[meta.tone],
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

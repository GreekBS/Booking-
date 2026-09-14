"use client";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { resolveCellState } from "../lib/cell-state";
import { useAvailabilityInteraction } from "../context/AvailabilityInteractionContext";
import type { UnitMeta } from "../types";
import type { AvailabilityRulesRecord, CalendarRecord } from "@/lib/admin/types";

interface CalendarDayCellProps {
  meta: UnitMeta;
  date: string;
  calendar: CalendarRecord | undefined;
  rules: AvailabilityRulesRecord | undefined;
  children: React.ReactNode;
}

export function CalendarDayCell({
  meta,
  date,
  calendar,
  rules,
  children,
}: CalendarDayCellProps) {
  const { cellActions } = useAvailabilityInteraction();
  const state = resolveCellState(calendar, date, rules);

  const hasBooking = Boolean(state.bookingId);
  const hasHold = Boolean(state.holdId);
  const hasOperatorBlock = Boolean(state.blockId);
  const canBlock = !hasBooking && !hasHold;
  const canOpen = !hasBooking && !hasHold;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {meta.unitName} · {date}
        </ContextMenuLabel>
        <ContextMenuSeparator />

        <ContextMenuItem
          disabled={!canBlock}
          title={!canBlock ? "Cannot block dates with an active booking or hold" : undefined}
          onSelect={() => cellActions.onBlockDates(meta, date)}
        >
          Block dates
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canOpen}
          title={!canOpen ? "Cannot open dates with an active booking or hold" : undefined}
          onSelect={() => cellActions.onOpenDates(meta, date)}
        >
          Open dates
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!canBlock}
          title={!canBlock ? "Unavailable while booked or held" : undefined}
          onSelect={() => cellActions.onCreateBlockType(meta, date, "maintenance")}
        >
          Maintenance
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canBlock}
          title={!canBlock ? "Unavailable while booked or held" : undefined}
          onSelect={() => cellActions.onCreateBlockType(meta, date, "cleaning")}
        >
          Cleaning
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canBlock}
          title={!canBlock ? "Unavailable while booked or held" : undefined}
          onSelect={() => cellActions.onCreateBlockType(meta, date, "owner")}
        >
          Owner stay
        </ContextMenuItem>

        {(hasBooking || hasHold || hasOperatorBlock) && <ContextMenuSeparator />}

        {hasBooking && (
          <ContextMenuItem onSelect={() => cellActions.onViewReservation(meta, date)}>
            View reservation
            <ContextMenuShortcut>↵</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {hasHold && (
          <ContextMenuItem onSelect={() => cellActions.onReleaseHold(meta, date)}>
            Release hold
          </ContextMenuItem>
        )}
        {hasOperatorBlock && (
          <ContextMenuItem onSelect={() => cellActions.onReleaseBlock(meta, date)}>
            Release block
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

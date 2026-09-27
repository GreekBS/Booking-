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
          title={!canBlock ? "Δεν κλειδώνουν ημερομηνίες με ενεργή κράτηση ή δέσμευση" : undefined}
          onSelect={() => cellActions.onBlockDates(meta, date)}
        >
          Κλείδωμα ημερομηνιών
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canOpen}
          title={!canOpen ? "Δεν ανοίγουν ημερομηνίες με ενεργή κράτηση ή δέσμευση" : undefined}
          onSelect={() => cellActions.onOpenDates(meta, date)}
        >
          Άνοιγμα ημερομηνιών
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!canBlock}
          title={!canBlock ? "Μη διαθέσιμο όσο υπάρχει κράτηση ή δέσμευση" : undefined}
          onSelect={() => cellActions.onCreateBlockType(meta, date, "maintenance")}
        >
          Συντήρηση
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canBlock}
          title={!canBlock ? "Μη διαθέσιμο όσο υπάρχει κράτηση ή δέσμευση" : undefined}
          onSelect={() => cellActions.onCreateBlockType(meta, date, "cleaning")}
        >
          Καθαρισμός
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!canBlock}
          title={!canBlock ? "Μη διαθέσιμο όσο υπάρχει κράτηση ή δέσμευση" : undefined}
          onSelect={() => cellActions.onCreateBlockType(meta, date, "owner")}
        >
          Διαμονή ιδιοκτήτη
        </ContextMenuItem>

        {(hasBooking || hasHold || hasOperatorBlock) && <ContextMenuSeparator />}

        {hasBooking && (
          <ContextMenuItem onSelect={() => cellActions.onViewReservation(meta, date)}>
            Προβολή κράτησης
            <ContextMenuShortcut>↵</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {hasHold && (
          <ContextMenuItem onSelect={() => cellActions.onReleaseHold(meta, date)}>
            Απελευθέρωση δέσμευσης
          </ContextMenuItem>
        )}
        {hasOperatorBlock && (
          <ContextMenuItem onSelect={() => cellActions.onReleaseBlock(meta, date)}>
            Απελευθέρωση block
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

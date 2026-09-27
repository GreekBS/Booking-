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
import type { AvailabilityRulesRecord, CalendarRecord } from "@/lib/admin/types";
import { resolveCellState } from "@/features/availability/lib/cell-state";
import { useCalendarOpsActions } from "../../context/CalendarOpsActionsContext";
import type { RackUnit } from "../../types";

interface TimelineCellContextMenuProps {
  unit: RackUnit;
  date: string;
  calendar: CalendarRecord | undefined;
  rules: AvailabilityRulesRecord | undefined;
  children: React.ReactNode;
}

export function TimelineCellContextMenu({
  unit,
  date,
  calendar,
  rules,
  children,
}: TimelineCellContextMenuProps) {
  const {
    openWorkspaceForCell,
    createBlockForCell,
    openMinStayForCell,
    releaseHoldById,
    releaseBlockById,
    confirmBookingById,
    cancelBookingById,
  } = useCalendarOpsActions();

  const state = resolveCellState(calendar, date, rules);
  const hasBooking = Boolean(state.bookingId);
  const hasHold = Boolean(state.holdId);
  const hasBlock = Boolean(state.blockId);
  const canBlock = !hasBooking && !hasHold;

  const booking = calendar?.bookings.find((b) => b.id === state.bookingId);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {unit.unitName} · {date}
        </ContextMenuLabel>
        <ContextMenuSeparator />

        {!hasBooking && !hasHold && !hasBlock && (
          <>
            <ContextMenuItem
              disabled={!canBlock}
              onSelect={() => openWorkspaceForCell(unit, date)}
            >
              Προβολή επιλογής
              <ContextMenuShortcut>↵</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canBlock}
              onSelect={() => void createBlockForCell(unit, date, "manual")}
            >
              Κλείδωμα ημερομηνιών
              <ContextMenuShortcut>B</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={!canBlock}
              onSelect={() => void createBlockForCell(unit, date, "maintenance")}
            >
              Συντήρηση
              <ContextMenuShortcut>M</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canBlock}
              onSelect={() => void createBlockForCell(unit, date, "cleaning")}
            >
              Καθαρισμός
              <ContextMenuShortcut>C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canBlock}
              onSelect={() => void createBlockForCell(unit, date, "owner")}
            >
              Διαμονή ιδιοκτήτη
              <ContextMenuShortcut>O</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => openMinStayForCell(unit.unitId, date)}>
              Ορισμός ελάχ. διαμονής
            </ContextMenuItem>
          </>
        )}

        {hasBooking && (
          <>
            <ContextMenuItem onSelect={() => openWorkspaceForCell(unit, date)}>
              Προβολή κράτησης
              <ContextMenuShortcut>↵</ContextMenuShortcut>
            </ContextMenuItem>
            {booking?.status === "pending" && (
              <ContextMenuItem onSelect={() => void confirmBookingById(state.bookingId!)}>
                Επιβεβαίωση κράτησης
              </ContextMenuItem>
            )}
            {booking && booking.status !== "cancelled" && booking.status !== "completed" && (
              <ContextMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => void cancelBookingById(state.bookingId!)}
              >
                Ακύρωση κράτησης
              </ContextMenuItem>
            )}
          </>
        )}

        {hasHold && (
          <>
            <ContextMenuItem onSelect={() => openWorkspaceForCell(unit, date)}>
              Προβολή δέσμευσης
              <ContextMenuShortcut>↵</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void releaseHoldById(unit, state.holdId!)}>
              Απελευθέρωση δέσμευσης
            </ContextMenuItem>
          </>
        )}

        {hasBlock && (
          <>
            <ContextMenuItem onSelect={() => openWorkspaceForCell(unit, date)}>
              Προβολή block
              <ContextMenuShortcut>↵</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void releaseBlockById(unit, state.blockId!)}>
              Απελευθέρωση block
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

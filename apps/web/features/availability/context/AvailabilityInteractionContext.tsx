"use client";

import { createContext, useContext } from "react";
import type { OperatorBlockType } from "@/lib/admin/types";
import type { CalendarFocus, CalendarSelection, UnitMeta } from "../types";

export interface CellContextActions {
  onBlockDates: (unit: UnitMeta, date: string) => void;
  onOpenDates: (unit: UnitMeta, date: string) => void;
  onCreateBlockType: (unit: UnitMeta, date: string, blockType: OperatorBlockType) => void;
  onViewReservation: (unit: UnitMeta, date: string) => void;
  onReleaseHold: (unit: UnitMeta, date: string) => void;
  onReleaseBlock: (unit: UnitMeta, date: string) => void;
}

export interface AvailabilityInteractionContextValue {
  selection: CalendarSelection | null;
  isDragging: boolean;
  focus: CalendarFocus | null;
  setFocus: (focus: CalendarFocus | null) => void;
  clearSelection: () => void;
  isSelected: (unitId: string, date: string) => boolean;
  isFocused: (unitId: string, date: string) => boolean;
  onCellMouseDown: (unitId: string, date: string) => void;
  onCellMouseEnter: (unitId: string, date: string) => void;
  onCellClick: (unit: UnitMeta, date: string) => void;
  cellActions: CellContextActions;
}

const AvailabilityInteractionContext = createContext<AvailabilityInteractionContextValue | null>(
  null,
);

export function AvailabilityInteractionProvider({
  value,
  children,
}: {
  value: AvailabilityInteractionContextValue;
  children: React.ReactNode;
}) {
  return (
    <AvailabilityInteractionContext.Provider value={value}>
      {children}
    </AvailabilityInteractionContext.Provider>
  );
}

export function useAvailabilityInteraction(): AvailabilityInteractionContextValue {
  const ctx = useContext(AvailabilityInteractionContext);
  if (!ctx) {
    throw new Error("useAvailabilityInteraction must be used within AvailabilityInteractionProvider");
  }
  return ctx;
}

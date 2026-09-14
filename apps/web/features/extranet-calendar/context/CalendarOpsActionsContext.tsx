"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useTenant } from "@/hooks/use-tenant";
import {
  adminFetch,
  createOperatorBlock,
  releaseHold,
  releaseOperatorBlock,
} from "@/lib/admin/api";
import type { BookingRecord, OperatorBlockType } from "@/lib/admin/types";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { resolveCellState } from "@/features/availability/lib/cell-state";
import type { CalendarSpanItem } from "@/features/availability/lib/span-layout";
import { useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import { useTimelineInteraction } from "./TimelineInteractionContext";
import { useCalendarActions, findUnitMeta } from "./CalendarActionsContext";
import type { RackUnit, TimelineSelection } from "../types";
import type { TodayOpItem } from "../lib/today-operations";
import { normalizeSelectionRange } from "../lib/selection-range";

interface CalendarOpsActionsContextValue {
  openWorkspaceForCell: (unit: RackUnit, date: string) => void;
  openWorkspaceForSpan: (unit: RackUnit, span: CalendarSpanItem) => void;
  openWorkspaceForTodayItem: (item: TodayOpItem) => void;
  openWorkspaceForSelection: (selection: TimelineSelection) => void;
  openMinStayForCell: (unitId: string, date: string) => void;
  createBlockForSelection: (blockType: OperatorBlockType) => Promise<void>;
  createBlockForCell: (unit: RackUnit, date: string, blockType: OperatorBlockType) => Promise<void>;
  releaseHoldById: (unit: RackUnit, holdId: string) => Promise<void>;
  releaseBlockById: (unit: RackUnit, blockId: string) => Promise<void>;
  confirmBookingById: (bookingId: string) => Promise<void>;
  cancelBookingById: (bookingId: string) => Promise<void>;
  getCellOccupancy: (unitId: string, date: string) => ReturnType<typeof resolveCellState>;
}

const CalendarOpsActionsContext = createContext<CalendarOpsActionsContextValue | null>(null);

export function CalendarOpsActionsProvider({ children }: { children: ReactNode }) {
  const { tenantId } = useTenant();
  const { openWorkspace, closeWorkspace, openDateWorkspace } = useWorkspace();
  const { selection, focus, clearSelection, applySelection } = useTimelineInteraction();
  const { refreshCalendars, calendarsByUnit, groups } = useCalendarActions();

  const openWorkspaceForCell = useCallback(
    (unit: RackUnit, date: string) => {
      const cal = calendarsByUnit[unit.unitId];
      const state = resolveCellState(cal, date);

      if (state.bookingId) {
        openWorkspace("booking", {
          booking: {
            id: state.bookingId,
            unitId: unit.unitId,
            unitName: unit.unitName,
            propertyName: unit.propertyName,
          },
        });
        return;
      }

      if (state.holdId) {
        openWorkspace("hold", {
          hold: {
            id: state.holdId,
            unitId: unit.unitId,
            unitName: unit.unitName,
            propertyName: unit.propertyName,
          },
        });
        return;
      }

      if (state.blockId) {
        const block = cal?.blocks.find((b) => b.id === state.blockId);
        openWorkspace("block", {
          block: {
            id: state.blockId,
            unitId: unit.unitId,
            unitName: unit.unitName,
            propertyName: unit.propertyName,
            blockType: block?.blockType ?? "manual",
            checkIn: block?.checkIn ?? date,
            checkOut: block?.checkOut ?? date,
            reason: block?.reason ?? null,
          },
        });
        return;
      }

      openDateWorkspace();
    },
    [calendarsByUnit, openWorkspace, openDateWorkspace],
  );

  const openWorkspaceForSpan = useCallback(
    (unit: RackUnit, span: CalendarSpanItem) => {
      if (span.kind === "booking") {
        openWorkspace("booking", {
          booking: {
            id: span.id,
            unitId: unit.unitId,
            unitName: unit.unitName,
            propertyName: unit.propertyName,
          },
        });
        return;
      }

      if (span.kind === "hold") {
        openWorkspace("hold", {
          hold: {
            id: span.id,
            unitId: unit.unitId,
            unitName: unit.unitName,
            propertyName: unit.propertyName,
          },
        });
        return;
      }

      openWorkspace("block", {
        block: {
          id: span.id,
          unitId: unit.unitId,
          unitName: unit.unitName,
          propertyName: unit.propertyName,
          blockType: span.operatorType ?? "manual",
          checkIn: span.checkIn,
          checkOut: span.checkOut,
          reason: span.operatorType && span.label !== span.operatorType ? span.label : null,
        },
      });
    },
    [openWorkspace],
  );

  const openWorkspaceForTodayItem = useCallback(
    (item: TodayOpItem) => {
      const unit = findUnitMeta(groups, item.unitId);
      if (!unit) return;

      if (item.bookingId) {
        openWorkspace("booking", {
          booking: {
            id: item.bookingId,
            unitId: unit.unitId,
            unitName: unit.unitName,
            propertyName: unit.propertyName,
          },
        });
        return;
      }

      if (item.holdId) {
        openWorkspace("hold", {
          hold: {
            id: item.holdId,
            unitId: unit.unitId,
            unitName: unit.unitName,
            propertyName: unit.propertyName,
          },
        });
        return;
      }

      if (item.blockId) {
        openWorkspace("block", {
          block: {
            id: item.blockId,
            unitId: unit.unitId,
            unitName: unit.unitName,
            propertyName: unit.propertyName,
            blockType: item.blockType ?? "manual",
            checkIn: item.checkIn,
            checkOut: item.checkOut,
            reason: item.reason ?? null,
          },
        });
      }
    },
    [groups, openWorkspace],
  );

  const openWorkspaceForSelection = useCallback(
    (sel: TimelineSelection) => {
      applySelection(sel);
      openDateWorkspace();
    },
    [applySelection, openDateWorkspace],
  );

  const openMinStayForCell = useCallback(
    (unitId: string, date: string) => {
      applySelection({ unitId, from: date, to: date, openMinStay: true });
      openDateWorkspace();
    },
    [applySelection, openDateWorkspace],
  );

  const createBlockForSelection = useCallback(
    async (blockType: OperatorBlockType) => {
      if (!tenantId) return;
      const sel =
        selection ??
        (focus ? { unitId: focus.unitId, from: focus.date, to: focus.date } : null);
      if (!sel) {
        toastError("Select dates on the calendar first");
        return;
      }

      const from = sel.from <= sel.to ? sel.from : sel.to;
      const to = sel.from <= sel.to ? sel.to : sel.from;
      const normalized = normalizeSelectionRange(from, to);
      if (normalized.checkIn >= normalized.checkOut) {
        toastError("Check-out must be after check-in");
        return;
      }

      try {
        await createOperatorBlock(tenantId, sel.unitId, {
          checkIn: normalized.checkIn,
          checkOut: normalized.checkOut,
          blockType,
          reason: null,
        });
        toastSuccess(`${blockType.replace("_", " ")} block created`);
        refreshCalendars();
        clearSelection();
        closeWorkspace();
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Failed to create block");
      }
    },
    [tenantId, selection, focus, refreshCalendars, clearSelection, closeWorkspace],
  );

  const createBlockForCell = useCallback(
    async (unit: RackUnit, date: string, blockType: OperatorBlockType) => {
      if (!tenantId) return;
      const normalized = normalizeSelectionRange(date, date);
      try {
        await createOperatorBlock(tenantId, unit.unitId, {
          checkIn: normalized.checkIn,
          checkOut: normalized.checkOut,
          blockType,
          reason: null,
        });
        toastSuccess(`${blockType.replace("_", " ")} block created`);
        refreshCalendars();
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Failed to create block");
      }
    },
    [tenantId, refreshCalendars],
  );

  const releaseHoldById = useCallback(
    async (unit: RackUnit, holdId: string) => {
      if (!tenantId) return;
      try {
        await releaseHold(tenantId, holdId);
        toastSuccess("Hold released");
        refreshCalendars();
        closeWorkspace();
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Failed to release hold");
      }
    },
    [tenantId, refreshCalendars, closeWorkspace],
  );

  const releaseBlockById = useCallback(
    async (unit: RackUnit, blockId: string) => {
      if (!tenantId) return;
      try {
        await releaseOperatorBlock(tenantId, unit.unitId, blockId);
        toastSuccess("Block removed");
        refreshCalendars();
        closeWorkspace();
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Failed to release block");
      }
    },
    [tenantId, refreshCalendars, closeWorkspace],
  );

  const confirmBookingById = useCallback(
    async (bookingId: string) => {
      if (!tenantId) return;
      try {
        await adminFetch<BookingRecord>(`/bookings/${bookingId}/confirm`, {
          method: "POST",
          tenantId,
        });
        toastSuccess("Booking confirmed");
        refreshCalendars();
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Confirm failed");
      }
    },
    [tenantId, refreshCalendars],
  );

  const cancelBookingById = useCallback(
    async (bookingId: string) => {
      if (!tenantId) return;
      try {
        await adminFetch<BookingRecord>(`/bookings/${bookingId}/cancel`, {
          method: "POST",
          tenantId,
          body: JSON.stringify({ reason: "Cancelled from calendar" }),
        });
        toastSuccess("Booking cancelled");
        refreshCalendars();
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Cancel failed");
      }
    },
    [tenantId, refreshCalendars],
  );

  const getCellOccupancy = useCallback(
    (unitId: string, date: string) => resolveCellState(calendarsByUnit[unitId], date),
    [calendarsByUnit],
  );

  const value = useMemo(
    () => ({
      openWorkspaceForCell,
      openWorkspaceForSpan,
      openWorkspaceForTodayItem,
      openWorkspaceForSelection,
      openMinStayForCell,
      createBlockForSelection,
      createBlockForCell,
      releaseHoldById,
      releaseBlockById,
      confirmBookingById,
      cancelBookingById,
      getCellOccupancy,
    }),
    [
      openWorkspaceForCell,
      openWorkspaceForSpan,
      openWorkspaceForTodayItem,
      openWorkspaceForSelection,
      openMinStayForCell,
      createBlockForSelection,
      createBlockForCell,
      releaseHoldById,
      releaseBlockById,
      confirmBookingById,
      cancelBookingById,
      getCellOccupancy,
    ],
  );

  return (
    <CalendarOpsActionsContext.Provider value={value}>
      {children}
    </CalendarOpsActionsContext.Provider>
  );
}

export function useCalendarOpsActions() {
  const ctx = useContext(CalendarOpsActionsContext);
  if (!ctx) {
    throw new Error("useCalendarOpsActions must be used within CalendarOpsActionsProvider");
  }
  return ctx;
}

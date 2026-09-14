"use client";



import { useCallback, useEffect, useMemo, useRef } from "react";
import type { OperatorBlockType } from "@/lib/admin/types";
import { blurActiveCalendarCell } from "../../lib/calendar-focus-utils";
import { useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import { isEntityWorkspaceMode } from "@/features/workspace/lib/workspace-types";

import { useTimelineInteraction } from "../../context/TimelineInteractionContext";

import { useCalendarOpsActions } from "../../context/CalendarOpsActionsContext";

import { useCalendarActions } from "../../context/CalendarActionsContext";

import {

  focusCellAfterTodayJump,

  useExtranetCalendarKeyboard,

} from "../../hooks/useExtranetCalendarKeyboard";

import { useTimelineVirtualScroll } from "../../context/TimelineVirtualScrollContext";



interface CalendarKeyboardBindingsProps {

  dates: string[];

  today: string;

  unitId: string | null;

  gridRef: React.RefObject<HTMLElement | null>;

  onToday: () => void;

  onRefresh: () => void;

}



export function CalendarKeyboardBindings({

  dates,

  today,

  unitId,

  gridRef,

  onToday,

  onRefresh,

}: CalendarKeyboardBindingsProps) {

  const { focus, setFocus, clearSelection } = useTimelineInteraction();

  const { workspace, closeWorkspace } = useWorkspace();

  const { openWorkspaceForCell, createBlockForSelection } = useCalendarOpsActions();

  const { groups: rackGroups } = useCalendarActions();

  const { scrollToDate } = useTimelineVirtualScroll();



  const unit = useMemo(() => {

    if (!unitId) return null;

    for (const group of rackGroups) {

      const match = group.units.find((u) => u.unitId === unitId);

      if (match) return match;

    }

    return null;

  }, [rackGroups, unitId]);



  const units = useMemo(() => (unit ? [unit] : []), [unit]);



  const focusRef = useRef(focus);

  focusRef.current = focus;



  useEffect(() => {

    if (!focus) return;

    scrollToDate(focus.date);



    let raf = 0;

    raf = requestAnimationFrame(() => {

      raf = requestAnimationFrame(() => {

        const el = gridRef.current?.querySelector(

          `[data-calendar-cell="true"][data-unit-id="${focus.unitId}"][data-date="${focus.date}"]`,

        ) as HTMLElement | null;

        el?.focus({ preventScroll: true });

      });

    });



    return () => cancelAnimationFrame(raf);

  }, [focus, gridRef, scrollToDate]);



  const handleEnter = useCallback(

    (activeUnitId: string, date: string) => {

      if (!unit || unit.unitId !== activeUnitId) return;

      openWorkspaceForCell(unit, date);

    },

    [unit, openWorkspaceForCell],

  );



  const handleEscape = useCallback(() => {
    if (isEntityWorkspaceMode(workspace.mode)) {
      clearSelection();
      blurActiveCalendarCell();
      closeWorkspace();
      return;
    }

    if (workspace.open) {
      clearSelection();
      blurActiveCalendarCell();
      closeWorkspace();
      return;
    }

    clearSelection();
  }, [workspace.open, workspace.mode, closeWorkspace, clearSelection]);



  const handleToday = useCallback(() => {

    onToday();

    if (unitId) {

      window.setTimeout(() => focusCellAfterTodayJump(dates, today, setFocus, unitId), 50);

    }

  }, [onToday, dates, today, setFocus, unitId]);



  const handleBlockShortcut = useCallback(

    (blockType: OperatorBlockType | "manual") => {

      void createBlockForSelection(blockType);

    },

    [createBlockForSelection],

  );



  useExtranetCalendarKeyboard({

    enabled: true,

    dates,

    units,

    focus,

    setFocus,

    onEnter: handleEnter,

    onEscape: handleEscape,

    onTodayShortcut: handleToday,

    onRefresh,

    onBlockShortcut: handleBlockShortcut,

    gridRef,

    gridNavigation: true,

  });



  return null;

}


"use client";

import { useEffect } from "react";
import type { CalendarFocus, UnitMeta } from "../types";

interface UseCalendarKeyboardOptions {
  enabled: boolean;
  dates: string[];
  units: UnitMeta[];
  focus: CalendarFocus | null;
  setFocus: (focus: CalendarFocus | null) => void;
  onEnter: (unit: UnitMeta, date: string) => void;
  onEscape: () => void;
  onTodayShortcut: () => void;
  gridRef: React.RefObject<HTMLElement | null>;
}

export function useCalendarKeyboard({
  enabled,
  dates,
  units,
  focus,
  setFocus,
  onEnter,
  onEscape,
  onTodayShortcut,
  gridRef,
}: UseCalendarKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const gridActive =
        gridRef.current?.contains(document.activeElement) ||
        document.activeElement === document.body;

      if (!gridActive && event.key !== "Escape") return;

      if (event.key === "Escape") {
        event.preventDefault();
        onEscape();
        return;
      }

      if (event.key === "t" || event.key === "T") {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        onTodayShortcut();
        return;
      }

      if (!focus || units.length === 0 || dates.length === 0) {
        if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
          event.preventDefault();
          const first = units[0];
          const today = new Date().toISOString().slice(0, 10);
          const date = dates.includes(today) ? today : dates[0]!;
          if (first) setFocus({ unitId: first.unitId, date });
        }
        return;
      }

      const unitIndex = units.findIndex((u) => u.unitId === focus.unitId);
      const dateIndex = dates.indexOf(focus.date);
      if (unitIndex < 0 || dateIndex < 0) return;

      const unit = units[unitIndex]!;

      if (event.key === "Enter") {
        event.preventDefault();
        onEnter(unit, focus.date);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (dateIndex > 0) setFocus({ unitId: focus.unitId, date: dates[dateIndex - 1]! });
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (dateIndex < dates.length - 1) setFocus({ unitId: focus.unitId, date: dates[dateIndex + 1]! });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (unitIndex > 0) {
          setFocus({ unitId: units[unitIndex - 1]!.unitId, date: focus.date });
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (unitIndex < units.length - 1) {
          setFocus({ unitId: units[unitIndex + 1]!.unitId, date: focus.date });
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, dates, units, focus, setFocus, onEnter, onEscape, onTodayShortcut, gridRef]);
}

export function focusDateAfterTodayJump(
  dates: string[],
  today: string,
  setFocus: (focus: CalendarFocus) => void,
  unitId: string,
) {
  const date = dates.includes(today) ? today : dates[0];
  if (date) setFocus({ unitId, date });
}

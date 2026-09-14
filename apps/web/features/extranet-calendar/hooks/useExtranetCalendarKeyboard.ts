"use client";

import { useEffect } from "react";
import type { OperatorBlockType } from "@/lib/admin/types";
import type { TimelineFocus, RackUnit } from "../types";

interface UseExtranetCalendarKeyboardOptions {
  enabled: boolean;
  dates: string[];
  units: RackUnit[];
  focus: TimelineFocus | null;
  setFocus: (focus: TimelineFocus | null) => void;
  onEnter: (unitId: string, date: string) => void;
  onEscape: () => void;
  onTodayShortcut: () => void;
  onRefresh: () => void;
  onBlockShortcut: (blockType: OperatorBlockType | "manual") => void;
  gridRef: React.RefObject<HTMLElement | null>;
  /** When true, ArrowUp/Down move ±10 days (month grid rows). */
  gridNavigation?: boolean;
}

export function useExtranetCalendarKeyboard({
  enabled,
  dates,
  units,
  focus,
  setFocus,
  onEnter,
  onEscape,
  onTodayShortcut,
  onRefresh,
  onBlockShortcut,
  gridRef,
  gridNavigation = false,
}: UseExtranetCalendarKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return;

    function isTypingTarget(target: HTMLElement) {
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );
    }

    function isGridActive() {
      return (
        gridRef.current?.contains(document.activeElement) ||
        document.activeElement === document.body ||
        document.activeElement === gridRef.current
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (isTypingTarget(target)) return;

      if (event.key === "Escape") {
        if (!isGridActive() && document.querySelector('[role="dialog"]')) return;
        event.preventDefault();
        onEscape();
        return;
      }

      if (!isGridActive()) return;

      if (event.key === "t" || event.key === "T") {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        onTodayShortcut();
        return;
      }

      if (event.key === "r" || event.key === "R") {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        onRefresh();
        return;
      }

      if (event.key === "b" || event.key === "B") {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        onBlockShortcut("manual");
        return;
      }

      if (event.key === "m" || event.key === "M") {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        onBlockShortcut("maintenance");
        return;
      }

      if (event.key === "c" || event.key === "C") {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        onBlockShortcut("cleaning");
        return;
      }

      if (event.key === "o" || event.key === "O") {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        onBlockShortcut("owner");
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

      if (event.key === "Enter") {
        event.preventDefault();
        onEnter(focus.unitId, focus.date);
        return;
      }

      if (event.key === "ArrowLeft" && dateIndex > 0) {
        event.preventDefault();
        setFocus({ unitId: focus.unitId, date: dates[dateIndex - 1]! });
        return;
      }

      if (event.key === "ArrowRight" && dateIndex < dates.length - 1) {
        event.preventDefault();
        setFocus({ unitId: focus.unitId, date: dates[dateIndex + 1]! });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (gridNavigation && dateIndex >= 10) {
          setFocus({ unitId: focus.unitId, date: dates[dateIndex - 10]! });
          return;
        }
        if (!gridNavigation && unitIndex > 0) {
          setFocus({ unitId: units[unitIndex - 1]!.unitId, date: focus.date });
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (gridNavigation && dateIndex + 10 < dates.length) {
          setFocus({ unitId: focus.unitId, date: dates[dateIndex + 10]! });
          return;
        }
        if (!gridNavigation && unitIndex < units.length - 1) {
          setFocus({ unitId: units[unitIndex + 1]!.unitId, date: focus.date });
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    enabled,
    dates,
    units,
    focus,
    setFocus,
    onEnter,
    onEscape,
    onTodayShortcut,
    onRefresh,
    onBlockShortcut,
    gridRef,
    gridNavigation,
  ]);
}

export function focusCellAfterTodayJump(
  dates: string[],
  today: string,
  setFocus: (focus: TimelineFocus) => void,
  unitId: string,
) {
  const date = dates.includes(today) ? today : dates[0];
  if (date) setFocus({ unitId, date });
}

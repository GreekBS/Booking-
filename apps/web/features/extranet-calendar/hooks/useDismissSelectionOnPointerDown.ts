"use client";

import { useEffect } from "react";
import { blurActiveCalendarCell } from "../lib/calendar-focus-utils";
import { useTimelineInteraction } from "../context/TimelineInteractionContext";

function isProtectedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest(
      [
        "[data-calendar-cell]",
        "[data-workspace-area]",
        '[role="dialog"]',
        '[role="menu"]',
        '[role="listbox"]',
        "input",
        "textarea",
        "select",
        "[contenteditable]",
      ].join(", "),
    ),
  );
}

export function useDismissSelectionOnPointerDown() {
  const { selection, isDragging, clearSelection } = useTimelineInteraction();

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!selection || isDragging) return;
      if (isProtectedTarget(event.target)) return;

      clearSelection();
      blurActiveCalendarCell();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [selection, isDragging, clearSelection]);
}

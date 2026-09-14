"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TimelineFocus, TimelineSelection } from "../types";

function normalizeRange(from: string, to: string): { from: string; to: string } {
  return from <= to ? { from, to } : { from: to, to: from };
}

function isDateInRange(selection: TimelineSelection | null, unitId: string, date: string) {
  if (!selection || selection.unitId !== unitId) return false;
  const { from, to } = normalizeRange(selection.from, selection.to);
  return date >= from && date <= to;
}

interface TimelineInteractionContextValue {
  selection: TimelineSelection | null;
  focus: TimelineFocus | null;
  isDragging: boolean;
  setFocus: (focus: TimelineFocus | null) => void;
  clearSelection: () => void;
  applySelection: (selection: TimelineSelection | null) => void;
  isSelected: (unitId: string, date: string) => boolean;
  isFocused: (unitId: string, date: string) => boolean;
  onCellMouseDown: (unitId: string, date: string) => void;
  onCellMouseEnter: (unitId: string, date: string) => void;
  onCellClick: (unitId: string, date: string) => void;
}

const TimelineInteractionContext = createContext<TimelineInteractionContextValue | null>(null);

export function TimelineInteractionProvider({
  children,
  onSelectionCommitted,
}: {
  children: ReactNode;
  onSelectionCommitted?: (selection: TimelineSelection) => void;
}) {
  const [selection, setSelection] = useState<TimelineSelection | null>(null);
  const [focus, setFocus] = useState<TimelineFocus | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ unitId: string; anchor: string } | null>(null);
  const dragMovedRef = useRef(false);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setFocus(null);
    setIsDragging(false);
    dragRef.current = null;
  }, []);

  const applySelection = useCallback(
    (next: TimelineSelection | null) => {
      if (!next) {
        clearSelection();
        return;
      }
      const { from, to } = normalizeRange(next.from, next.to);
      setSelection({ ...next, from, to });
      setFocus({ unitId: next.unitId, date: from });
    },
    [clearSelection],
  );

  const selectionRef = useRef<TimelineSelection | null>(null);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    function onMouseUp() {
      if (dragRef.current && dragMovedRef.current && selectionRef.current) {
        onSelectionCommitted?.(selectionRef.current);
      }
      if (dragRef.current) setIsDragging(false);
      dragRef.current = null;
    }
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [onSelectionCommitted]);

  const onCellMouseDown = useCallback((unitId: string, date: string) => {
    dragRef.current = { unitId, anchor: date };
    dragMovedRef.current = false;
    setIsDragging(true);
    setSelection({ unitId, from: date, to: date });
    setFocus({ unitId, date });
  }, []);

  const onCellMouseEnter = useCallback((unitId: string, date: string) => {
    const drag = dragRef.current;
    if (!drag || drag.unitId !== unitId) return;
    if (date !== drag.anchor) dragMovedRef.current = true;
    setSelection({ unitId, from: drag.anchor, to: date });
  }, []);

  const onCellClick = useCallback(
    (unitId: string, date: string) => {
      if (dragMovedRef.current) {
        dragMovedRef.current = false;
        return;
      }
      const next = { unitId, from: date, to: date };
      setSelection(next);
      setFocus({ unitId, date });
      onSelectionCommitted?.(next);
    },
    [onSelectionCommitted],
  );

  const value = useMemo(
    () => ({
      selection,
      focus,
      isDragging,
      setFocus,
      clearSelection,
      applySelection,
      isSelected: (unitId: string, date: string) => isDateInRange(selection, unitId, date),
      isFocused: (unitId: string, date: string) =>
        focus?.unitId === unitId && focus.date === date,
      onCellMouseDown,
      onCellMouseEnter,
      onCellClick,
    }),
    [
      selection,
      focus,
      isDragging,
      clearSelection,
      applySelection,
      onCellMouseDown,
      onCellMouseEnter,
      onCellClick,
    ],
  );

  return (
    <TimelineInteractionContext.Provider value={value}>
      {children}
    </TimelineInteractionContext.Provider>
  );
}

export function useTimelineInteraction() {
  const ctx = useContext(TimelineInteractionContext);
  if (!ctx) {
    throw new Error("useTimelineInteraction must be used within TimelineInteractionProvider");
  }
  return ctx;
}

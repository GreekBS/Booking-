import type { CalendarSelection } from "../types";

export interface SelectionBounds {
  unitId: string;
  from: string;
  to: string;
}

export function normalizeSelectionBounds(selection: CalendarSelection): SelectionBounds {
  const from = selection.from <= selection.to ? selection.from : selection.to;
  const to = selection.from <= selection.to ? selection.to : selection.from;
  return { unitId: selection.unitId, from, to };
}

export function isDateInSelection(
  selection: CalendarSelection | null,
  unitId: string,
  date: string,
): boolean {
  if (!selection || selection.unitId !== unitId) return false;
  const { from, to } = normalizeSelectionBounds(selection);
  return date >= from && date <= to;
}

export function getActionRange(
  unitId: string,
  date: string,
  selection: CalendarSelection | null,
): { from: string; to: string } {
  if (selection && selection.unitId === unitId) {
    const { from, to } = normalizeSelectionBounds(selection);
    return { from, to };
  }
  return { from: date, to: date };
}

export function formatSelectionLabel(selection: CalendarSelection, addDaysIso: (iso: string, days: number) => string): string {
  const { from, to } = normalizeSelectionBounds(selection);
  const checkout = addDaysIso(to, 1);
  if (from === to) return from;
  return `${from} → ${checkout}`;
}

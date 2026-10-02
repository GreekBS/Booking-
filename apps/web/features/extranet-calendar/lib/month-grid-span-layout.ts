import type { CalendarRecord, OperatorBlockType } from "@/lib/admin/types";
import { OPERATOR_BLOCK_TYPES } from "@/lib/admin/types";
import { dateInStayPeriod } from "@/features/availability/lib/calendar-utils";
import {
  guestInitials,
  holdCountdownShort,
  truncateLabel,
} from "@/features/availability/lib/display-utils";
import type { SpanKind } from "@/features/availability/lib/span-layout";

/**
 * Month-grid visual reservation strip.
 * Stay inventory remains [checkIn, checkOut); checkout day may appear only as a
 * left-half visual endpoint (startInset/endInset), never as an occupied night.
 */
export interface MonthGridVisualSpan {
  id: string;
  kind: SpanKind;
  checkIn: string;
  checkOut: string;
  /** Inclusive first column covered by the bar (may be the checkout stub). */
  startIndex: number;
  /** Inclusive last column covered by the bar (may be the checkout stub). */
  endIndex: number;
  /** True when this segment includes the booking's real check-in night. */
  checkInEdge: boolean;
  /** True when this segment includes the booking's exclusive checkout day visually. */
  checkOutEdge: boolean;
  /** Fraction of the start column to skip (0 or 0.5). */
  startInset: number;
  /** Fraction of the end column left empty after the bar (0 or 0.5). */
  endInset: number;
  label: string;
  preview: string;
  subPreview?: string;
  operatorType?: OperatorBlockType;
  status?: string;
  expiresAt?: string;
  zIndex: number;
}

const OPERATOR_SET = new Set<string>(OPERATOR_BLOCK_TYPES);

function nightIndices(dates: string[], checkIn: string, checkOut: string): number[] {
  const indices: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (date && dateInStayPeriod(date, checkIn, checkOut)) {
      indices.push(i);
    }
  }
  return indices;
}

function pushVisualSpan(
  spans: MonthGridVisualSpan[],
  input: {
    id: string;
    kind: SpanKind;
    checkIn: string;
    checkOut: string;
    dates: string[];
    nights: number[];
    meta: Pick<
      MonthGridVisualSpan,
      "label" | "preview" | "subPreview" | "operatorType" | "status" | "expiresAt"
    >;
    zIndex: number;
  },
): void {
  const { dates, checkIn, checkOut, nights } = input;
  const checkoutIdx = dates.indexOf(checkOut);

  if (nights.length === 0 && checkoutIdx < 0) return;

  // Checkout-only stub (exclusive checkout day appears in this row with no nights).
  if (nights.length === 0 && checkoutIdx >= 0) {
    spans.push({
      id: input.id,
      kind: input.kind,
      checkIn,
      checkOut,
      startIndex: checkoutIdx,
      endIndex: checkoutIdx,
      checkInEdge: false,
      checkOutEdge: true,
      startInset: 0,
      endInset: 0.5,
      zIndex: input.zIndex,
      ...input.meta,
    });
    return;
  }

  const startIndex = nights[0]!;
  const lastNightIndex = nights[nights.length - 1]!;
  const firstDate = dates[startIndex]!;
  const includesCheckIn = firstDate === checkIn;
  const includesCheckout = checkoutIdx >= 0;

  spans.push({
    id: input.id,
    kind: input.kind,
    checkIn,
    checkOut,
    startIndex,
    endIndex: includesCheckout ? checkoutIdx : lastNightIndex,
    checkInEdge: includesCheckIn,
    checkOutEdge: includesCheckout,
    startInset: includesCheckIn ? 0.5 : 0,
    endInset: includesCheckout ? 0.5 : 0,
    zIndex: input.zIndex,
    ...input.meta,
  });
}

/** Build visual month-grid spans with half-day check-in / check-out geometry. */
export function buildMonthGridVisualSpans(
  calendar: CalendarRecord | undefined,
  dates: string[],
): MonthGridVisualSpan[] {
  if (!calendar || dates.length === 0) return [];

  const spans: MonthGridVisualSpan[] = [];

  for (const block of calendar.blocks) {
    if (block.status !== "active" || !OPERATOR_SET.has(block.blockType)) continue;
    const opType = block.blockType as OperatorBlockType;
    const reason = block.reason?.trim();
    pushVisualSpan(spans, {
      id: block.id,
      kind: "operator",
      checkIn: block.checkIn,
      checkOut: block.checkOut,
      dates,
      nights: nightIndices(dates, block.checkIn, block.checkOut),
      meta: {
        label: reason ?? opType,
        preview: reason ? truncateLabel(reason, 14) : opType,
        operatorType: opType,
      },
      zIndex: 10,
    });
  }

  for (const hold of calendar.holds) {
    if (hold.status !== "active") continue;
    pushVisualSpan(spans, {
      id: hold.id,
      kind: "hold",
      checkIn: hold.checkIn,
      checkOut: hold.checkOut,
      dates,
      nights: nightIndices(dates, hold.checkIn, hold.checkOut),
      meta: {
        label: `Hold · expires ${new Date(hold.expiresAt).toLocaleString()}`,
        preview: holdCountdownShort(hold.expiresAt),
        subPreview: "Δέσμευση",
        expiresAt: hold.expiresAt,
        status: hold.status,
      },
      zIndex: 20,
    });
  }

  for (const booking of calendar.bookings) {
    if (booking.status === "cancelled") continue;
    const initials = guestInitials(booking.guestName);
    const namePreview = truncateLabel(booking.guestName, 12);
    pushVisualSpan(spans, {
      id: booking.id,
      kind: "booking",
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      dates,
      nights: nightIndices(dates, booking.checkIn, booking.checkOut),
      meta: {
        label: `${booking.guestName} · ${booking.status}`,
        preview: `${initials} ${namePreview}`,
        subPreview: booking.status.replace(/_/g, " "),
        status: booking.status,
      },
      zIndex: 30,
    });
  }

  return spans.sort((a, b) => a.zIndex - b.zIndex || a.startIndex - b.startIndex);
}

/** Absolute left/width for a visual span inside a gap-aware CSS grid row. */
export function monthGridBarPositionStyle(
  span: MonthGridVisualSpan,
  columnCount: number,
  gapPx: number,
): { left: string; width: string } {
  const n = Math.max(columnCount, 1);
  const gapTotal = (n - 1) * gapPx;
  const col = `((100% - ${gapTotal}px) / ${n})`;
  const left = `calc(${span.startIndex} * (${col} + ${gapPx}px) + ${span.startInset} * ${col})`;
  const spanCols = span.endIndex - span.startIndex;
  const filledInEndCells = 1 - span.startInset - span.endInset;
  const width = `calc(${spanCols} * (${col} + ${gapPx}px) + ${filledInEndCells} * ${col})`;
  return { left, width };
}

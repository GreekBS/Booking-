import type { CalendarRecord, OperatorBlockType } from "@/lib/admin/types";
import { OPERATOR_BLOCK_TYPES } from "@/lib/admin/types";
import { addDaysIso, dateInStayPeriod } from "./calendar-utils";
import { guestInitials, holdCountdownShort, truncateLabel } from "./display-utils";

export type SpanKind = "booking" | "hold" | "operator";

export interface CalendarSpanItem {
  id: string;
  kind: SpanKind;
  checkIn: string;
  checkOut: string;
  startIndex: number;
  endIndex: number;
  checkInEdge: boolean;
  checkOutEdge: boolean;
  label: string;
  preview: string;
  subPreview?: string;
  operatorType?: OperatorBlockType;
  status?: string;
  expiresAt?: string;
  zIndex: number;
}

const OPERATOR_SET = new Set<string>(OPERATOR_BLOCK_TYPES);

function indicesInStay(dates: string[], checkIn: string, checkOut: string): number[] {
  const indices: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    if (date && dateInStayPeriod(date, checkIn, checkOut)) {
      indices.push(i);
    }
  }
  return indices;
}

function spanFromIndices(
  id: string,
  kind: SpanKind,
  checkIn: string,
  checkOut: string,
  dates: string[],
  indices: number[],
  meta: Omit<
    CalendarSpanItem,
    | "id"
    | "kind"
    | "checkIn"
    | "checkOut"
    | "startIndex"
    | "endIndex"
    | "checkInEdge"
    | "checkOutEdge"
    | "zIndex"
  >,
  zIndex: number,
): CalendarSpanItem {
  const startIndex = indices[0]!;
  const endIndex = indices[indices.length - 1]!;
  const firstDate = dates[startIndex]!;
  const lastDate = dates[endIndex]!;

  return {
    id,
    kind,
    checkIn,
    checkOut,
    startIndex,
    endIndex,
    checkInEdge: firstDate === checkIn,
    checkOutEdge: addDaysIso(lastDate, 1) === checkOut,
    zIndex,
    ...meta,
  };
}

export function buildCalendarSpans(
  calendar: CalendarRecord | undefined,
  dates: string[],
): CalendarSpanItem[] {
  if (!calendar || dates.length === 0) return [];

  const spans: CalendarSpanItem[] = [];

  for (const block of calendar.blocks) {
    if (block.status !== "active" || !OPERATOR_SET.has(block.blockType)) continue;
    const indices = indicesInStay(dates, block.checkIn, block.checkOut);
    if (indices.length === 0) continue;

    const opType = block.blockType as OperatorBlockType;
    const reason = block.reason?.trim();
    const preview = reason ? truncateLabel(reason, 14) : opType;

    spans.push(
      spanFromIndices(
        block.id,
        "operator",
        block.checkIn,
        block.checkOut,
        dates,
        indices,
        {
          label: reason ?? opType,
          preview,
          operatorType: opType,
        },
        10,
      ),
    );
  }

  for (const hold of calendar.holds) {
    if (hold.status !== "active") continue;
    const indices = indicesInStay(dates, hold.checkIn, hold.checkOut);
    if (indices.length === 0) continue;

    spans.push(
      spanFromIndices(
        hold.id,
        "hold",
        hold.checkIn,
        hold.checkOut,
        dates,
        indices,
        {
          label: `Hold · expires ${new Date(hold.expiresAt).toLocaleString()}`,
          preview: holdCountdownShort(hold.expiresAt),
          subPreview: "Hold",
          expiresAt: hold.expiresAt,
          status: hold.status,
        },
        20,
      ),
    );
  }

  for (const booking of calendar.bookings) {
    if (booking.status === "cancelled") continue;
    const indices = indicesInStay(dates, booking.checkIn, booking.checkOut);
    if (indices.length === 0) continue;

    const initials = guestInitials(booking.guestName);
    const namePreview = truncateLabel(booking.guestName, 12);

    spans.push(
      spanFromIndices(
        booking.id,
        "booking",
        booking.checkIn,
        booking.checkOut,
        dates,
        indices,
        {
          label: `${booking.guestName} · ${booking.status}`,
          preview: `${initials} ${namePreview}`,
          subPreview: booking.status.replace(/_/g, " "),
          status: booking.status,
        },
        30,
      ),
    );
  }

  return spans.sort((a, b) => a.zIndex - b.zIndex || a.startIndex - b.startIndex);
}

export function spanOccupiesIndex(span: CalendarSpanItem, index: number): boolean {
  return index >= span.startIndex && index <= span.endIndex;
}

export function hasSpanAtIndex(spans: CalendarSpanItem[], index: number): boolean {
  return spans.some((span) => spanOccupiesIndex(span, index));
}

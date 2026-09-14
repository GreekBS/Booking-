import type {
  AvailabilityRulesRecord,
  CalendarRecord,
  RatePlanRecord,
} from "@/lib/admin/types";
import { dayOfWeekUtc, formatHeaderDate } from "./calendar-utils";
import { resolveCellState } from "./cell-state";
import { getNightlyRate } from "./nightly-rates";
import { holdCountdownShort } from "./display-utils";

export interface CellHoverInfo {
  dateLabel: string;
  unitName: string;
  propertyName: string;
  stateLabel: string;
  stateType: string;
  priceLine: string | null;
  restrictionsLine: string | null;
  summaryLine: string | null;
}

export function buildCellHoverInfo(
  date: string,
  unitName: string,
  propertyName: string,
  calendar: CalendarRecord | undefined,
  rules: AvailabilityRulesRecord | undefined,
  ratePlan: RatePlanRecord | null | undefined,
): CellHoverInfo {
  const interaction = resolveCellState(calendar, date, rules);
  const header = formatHeaderDate(date);
  const dateLabel = `${header.dow} ${date}`;

  let priceLine: string | null = null;
  const nightly = getNightlyRate(ratePlan, date);
  if (nightly) {
    priceLine = `${nightly.amount} ${nightly.currency}${nightly.seasonName ? ` · ${nightly.seasonName}` : ""}`;
  }

  let restrictionsLine: string | null = null;
  if (rules) {
    const dow = dayOfWeekUtc(date);
    const cta = rules.checkInDays.length === 0 || rules.checkInDays.includes(dow);
    const ctd = rules.checkOutDays.length === 0 || rules.checkOutDays.includes(dow);
    restrictionsLine = `Min ${rules.minNights}n · max ${rules.maxNights}n · CTA ${cta ? "yes" : "no"} · CTD ${ctd ? "yes" : "no"}`;
  }

  let summaryLine: string | null = null;
  if (interaction.bookingId && calendar) {
    const b = calendar.bookings.find((x) => x.id === interaction.bookingId);
    if (b) summaryLine = `Booking: ${b.guestName} (${b.status})`;
  } else if (interaction.holdId && calendar) {
    const h = calendar.holds.find((x) => x.id === interaction.holdId);
    if (h) summaryLine = `Hold: expires ${holdCountdownShort(h.expiresAt)}`;
  } else if (interaction.blockId && calendar) {
    const b = calendar.blocks.find((x) => x.id === interaction.blockId);
    if (b) summaryLine = `Block: ${b.reason ?? b.blockType}`;
  }

  return {
    dateLabel,
    unitName,
    propertyName,
    stateLabel: interaction.label,
    stateType: interaction.type,
    priceLine,
    restrictionsLine,
    summaryLine,
  };
}

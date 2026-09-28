/**
 * Property-local arrival scheduling helpers for WhatsApp Arrival automation.
 * Does not invent timezone — callers pass Property.timezone (IANA).
 */

import type { ArrivalTimingMode } from "../domain/WhatsAppMessagingTypes";

export interface ArrivalScheduleInput {
  checkInDate: string; // YYYY-MM-DD
  timezone: string;
  timingMode: ArrivalTimingMode;
  localTime: string; // HH:mm
  offsetDays: number;
  offsetHours: number;
}

/**
 * Compute UTC instant for Arrival send.
 * Uses Intl for property-local wall time → approximate UTC via offset sampling.
 */
export function computeArrivalScheduledFor(
  input: ArrivalScheduleInput,
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.checkInDate.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(input.localTime.trim());
  if (!dateMatch || !timeMatch) return null;

  let year = Number(dateMatch[1]);
  let month = Number(dateMatch[2]);
  let day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (input.timingMode === "days_before_check_in") {
    const base = new Date(Date.UTC(year, month - 1, day));
    base.setUTCDate(base.getUTCDate() - Math.max(0, input.offsetDays));
    year = base.getUTCFullYear();
    month = base.getUTCMonth() + 1;
    day = base.getUTCDate();
  } else if (input.timingMode === "hours_before_check_in") {
    // Start from check-in localTime, then subtract hours in UTC after conversion.
    const atCheckIn = zonedLocalToUtc(
      year,
      month,
      day,
      hour,
      minute,
      input.timezone,
    );
    if (!atCheckIn) return null;
    return new Date(
      atCheckIn.getTime() - Math.max(0, input.offsetHours) * 60 * 60 * 1000,
    );
  }

  return zonedLocalToUtc(year, month, day, hour, minute, input.timezone);
}

function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date | null {
  try {
    // Guess: interpret as if UTC then adjust by offset at that instant.
    const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(guess).map((p) => [p.type, p.value]),
    );
    const asLocal = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const offset = asLocal - guess.getTime();
    return new Date(guess.getTime() - offset);
  } catch {
    return null;
  }
}

export const WELCOME_OCCURRENCE_KEY = "v1";

export function arrivalOccurrenceKey(checkInDate: string): string {
  return `checkin:${checkInDate.trim()}`;
}

import { LocalDate } from "../shared/value-objects/LocalDate";
import { StayPeriod } from "../shared/value-objects/StayPeriod";
import { ValidationError } from "../../shared/errors/DomainError";

/**
 * Temporal class of a stay relative to a property's local calendar date.
 * Used by CSV / operator import policies — not by live sell paths.
 */
export type ImportStayTemporalClass = "historical" | "in_progress" | "future";

/**
 * Classifies a stay using property-local "today" (not server UTC).
 *
 * - historical: checkOut <= today
 * - in_progress: checkIn < today && checkOut > today
 * - future: checkIn >= today (includes check-in today)
 */
export function classifyImportStayTemporalClass(
  checkIn: string,
  checkOut: string,
  propertyLocalToday: string | LocalDate,
): ImportStayTemporalClass {
  const stay = StayPeriod.create(checkIn, checkOut);
  const today =
    typeof propertyLocalToday === "string"
      ? LocalDate.create(propertyLocalToday)
      : propertyLocalToday;

  if (stay.checkOut.isBeforeOrEqual(today)) {
    return "historical";
  }
  if (stay.checkIn.isBefore(today) && stay.checkOut.isAfter(today)) {
    return "in_progress";
  }
  if (stay.checkIn.isAfterOrEqual(today)) {
    return "future";
  }

  throw new ValidationError("Unable to classify stay temporal class");
}

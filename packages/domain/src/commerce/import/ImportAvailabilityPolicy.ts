import type { ImportStayTemporalClass } from "./ImportStayTemporalClass";

/**
 * Opt-in availability evaluation policies for import / migration.
 * Default live sell behavior remains `live_sell` (implicit when policy omitted).
 */
export type AvailabilityEvaluationPolicy =
  | "live_sell"
  | "csv_import_historical"
  | "csv_import_in_progress"
  | "csv_import_future";

export function importAvailabilityPolicyForTemporalClass(
  temporalClass: ImportStayTemporalClass,
): Exclude<AvailabilityEvaluationPolicy, "live_sell"> {
  switch (temporalClass) {
    case "historical":
      return "csv_import_historical";
    case "in_progress":
      return "csv_import_in_progress";
    case "future":
      return "csv_import_future";
  }
}

/** Present-day sellability rules waived for already-started / completed facts. */
export function bypassesSellabilityRules(
  policy: AvailabilityEvaluationPolicy | undefined,
): boolean {
  return policy === "csv_import_historical" || policy === "csv_import_in_progress";
}

export function bypassesTurnoverBuffer(
  policy: AvailabilityEvaluationPolicy | undefined,
): boolean {
  return policy === "csv_import_historical";
}

/** Historical capacity mismatch is a warning, not a blocking reason. */
export function treatsGuestCapacityAsWarning(
  policy: AvailabilityEvaluationPolicy | undefined,
): boolean {
  return policy === "csv_import_historical";
}

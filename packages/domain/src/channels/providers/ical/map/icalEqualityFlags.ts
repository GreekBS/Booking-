import { ICAL_PARSE_ISSUE_CODES, type IcalParseIssueCode } from "../parse/icalParseIssueCodes";
import type { NormalizedIcalIssue } from "../parse/icalParseTypes";
import type { IcalEqualityFlags } from "./icalMapTypes";

export type IcalIssueOwnership =
  | "identity"
  | "interval"
  | "entry_equality"
  | "classification_only"
  | "informational";

/**
 * Exhaustive ownership for every current P1-S3 issue code.
 * Adding a repository issue code without a mapping entry fails tests.
 */
export const ICAL_ISSUE_OWNERSHIP_V1: Record<IcalParseIssueCode, IcalIssueOwnership> = {
  DUPLICATE_UID_PROPERTY: "identity",
  DUPLICATE_DTSTART_PROPERTY: "interval",
  DUPLICATE_DTEND_PROPERTY: "interval",
  DUPLICATE_DURATION_PROPERTY: "entry_equality",
  DUPLICATE_SEQUENCE_PROPERTY: "entry_equality",
  DUPLICATE_STATUS_PROPERTY: "entry_equality",
  DUPLICATE_SUMMARY_PROPERTY: "informational",
  DUPLICATE_DESCRIPTION_PROPERTY: "informational",
  DUPLICATE_LOCATION_PROPERTY: "informational",
  DUPLICATE_DTSTAMP_PROPERTY: "informational",
  DUPLICATE_CREATED_PROPERTY: "informational",
  DUPLICATE_LAST_MODIFIED_PROPERTY: "informational",
  DUPLICATE_RECURRENCE_ID_PROPERTY: "identity",
  DUPLICATE_PRODID_PROPERTY: "informational",
  DUPLICATE_VERSION_PROPERTY: "informational",
  DUPLICATE_METHOD_PROPERTY: "informational",
  DUPLICATE_CALSCALE_PROPERTY: "informational",
  DUPLICATE_VALUE_PARAMETER: "interval",
  DUPLICATE_TZID_PARAMETER: "interval",
  EMPTY_TZID: "interval",
  TZID_ON_DATE: "interval",
  TZID_WITH_UTC: "interval",
  VALUE_TYPE_MISMATCH: "interval",
  UNSUPPORTED_VALUE_PARAMETER: "interval",
  DISALLOWED_TEMPORAL_FORM: "interval",
  UNSUPPORTED_DATETIME_FORM: "interval",
  UNSUPPORTED_LEAP_SECOND: "interval",
  INVALID_TEXT_ESCAPE: "classification_only",
  INVALID_SEQUENCE: "entry_equality",
  UNEXPECTED_COMPONENT_PLACEMENT: "classification_only",
  MISSING_VERSION: "informational",
  UNSUPPORTED_VERSION: "classification_only",
  MISSING_PRODID: "informational",
  MULTIPLE_RRULE_PROPERTIES: "entry_equality",
};

/** Compile-time exhaustiveness: every parse issue code must appear once. */
type AssertExhaustiveMapping =
  Exclude<(typeof ICAL_PARSE_ISSUE_CODES)[number], keyof typeof ICAL_ISSUE_OWNERSHIP_V1> extends never
    ? true
    : never;
const _assertExhaustive: AssertExhaustiveMapping = true;
void _assertExhaustive;

const TEMPORAL_PROPERTY_NAMES = new Set([
  "DTSTART",
  "DTEND",
  "RECURRENCE-ID",
  "DTSTAMP",
  "CREATED",
  "LAST-MODIFIED",
]);

export function emptyEqualityFlags(): IcalEqualityFlags {
  return {
    identityInvalid: false,
    duplicateUidProperty: false,
    timeInvalid: false,
    recurrenceUnsupported: false,
    multipleRrule: false,
    unsupportedFeature: false,
    recurrenceIdentityHashed: false,
  };
}

export function encodeEqualityBitfield(flags: IcalEqualityFlags): number {
  let bits = 0;
  if (flags.identityInvalid) bits |= 1 << 0;
  if (flags.duplicateUidProperty) bits |= 1 << 1;
  if (flags.timeInvalid) bits |= 1 << 2;
  if (flags.recurrenceUnsupported) bits |= 1 << 3;
  if (flags.multipleRrule) bits |= 1 << 4;
  if (flags.unsupportedFeature) bits |= 1 << 5;
  if (flags.recurrenceIdentityHashed) bits |= 1 << 6;
  return bits;
}

export function applyParserIssuesToEqualityFlags(
  issues: readonly NormalizedIcalIssue[],
  flags: IcalEqualityFlags,
): IcalEqualityFlags {
  const next = { ...flags };
  for (const issue of issues) {
    const ownership = ICAL_ISSUE_OWNERSHIP_V1[issue.code];
    if (ownership === undefined) {
      // Unknown future codes: no equality effect for eh:1.
      continue;
    }
    switch (issue.code) {
      case "DUPLICATE_UID_PROPERTY":
        next.identityInvalid = true;
        next.duplicateUidProperty = true;
        break;
      case "DUPLICATE_RECURRENCE_ID_PROPERTY":
        next.identityInvalid = true;
        next.recurrenceUnsupported = true;
        break;
      case "MULTIPLE_RRULE_PROPERTIES":
        next.multipleRrule = true;
        next.unsupportedFeature = true;
        break;
      case "DUPLICATE_DURATION_PROPERTY":
        next.unsupportedFeature = true;
        break;
      case "DUPLICATE_SEQUENCE_PROPERTY":
      case "INVALID_SEQUENCE":
      case "DUPLICATE_STATUS_PROPERTY":
        next.unsupportedFeature = true;
        break;
      default:
        if (ownership === "interval") {
          if (
            issue.propertyName === undefined ||
            TEMPORAL_PROPERTY_NAMES.has(issue.propertyName) ||
            issue.propertyName === "DURATION"
          ) {
            next.timeInvalid = true;
          }
        }
        break;
    }
  }
  return next;
}

export function assertIssueMappingComplete(): void {
  for (const code of ICAL_PARSE_ISSUE_CODES) {
    if (!(code in ICAL_ISSUE_OWNERSHIP_V1)) {
      throw new Error(`Missing P1-S4a issue mapping for ${code}`);
    }
  }
}

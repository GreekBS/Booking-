/** Soft mapper-local issue codes (not platform taxonomy). */

export const ICAL_MAP_ISSUE_CODES = [
  "CURSOR_INVALID",
  "CURSOR_UNSUPPORTED_VERSION",
  "CURSOR_ABSENT",
  "MAP_ENTRY_IDENTITY_OVERFLOW",
  "MAP_TEMPORAL_IDENTITY_HASHED",
] as const;

export type IcalMapIssueCode = (typeof ICAL_MAP_ISSUE_CODES)[number];

export interface IcalMapIssue {
  readonly code: IcalMapIssueCode;
  readonly eventIndex?: number;
}

/** Bounded iCal-specific secondary reason codes (no PII). */

export const ICAL_REASON_CODES = {
  UID_OVER_LIMIT: "ical_uid_over_limit",
  DUPLICATE_UID_PROPERTY: "ical_duplicate_uid_property",
  DUPLICATE_GROUP: "ical_duplicate_group",
  MISSING_DTEND: "ical_missing_dtend",
  UNRESOLVED_INTERVAL: "ical_unresolved_interval",
  RRULE_PRESENT: "ical_rrule_present",
  RDATE_PRESENT: "ical_rdate_present",
  EXDATE_PRESENT: "ical_exdate_present",
  RECURRENCE_ID_PRESENT: "ical_recurrence_id_present",
  RECURRENCE_IDENTITY_HASHED: "ical_recurrence_identity_hashed",
  STATUS_CANCELLED: "ical_status_cancelled",
  MULTIPLE_RRULE: "ical_multiple_rrule",
  UNSUPPORTED_FEATURE: "ical_unsupported_feature",
  PARSER_LIMITATION: "ical_parser_limitation",
  ANONYMOUS_IDENTITY: "ical_anonymous_identity",
  CURSOR_INVALID: "ical_cursor_invalid",
  CURSOR_UNSUPPORTED_VERSION: "ical_cursor_unsupported_version",
  REMOVED_FROM_FEED: "ical_removed_from_feed",
  AMBIGUOUS_RESERVATION: "ical_ambiguous_reservation",
  RESOLVABLE_INTERVAL: "ical_resolvable_interval",
} as const;

export type IcalReasonCode = (typeof ICAL_REASON_CODES)[keyof typeof ICAL_REASON_CODES];

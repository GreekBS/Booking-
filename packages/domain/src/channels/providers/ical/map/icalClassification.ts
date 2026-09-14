import type { UnknownCategory } from "../../../types/UnknownTaxonomy";
import { ICAL_MAP_LIMITS } from "./icalMapLimits";
import type { IcalSnapshotEntry } from "./icalMapTypes";
import type { IcalClassification, IcalEvidenceKind } from "./icalEvidenceTypes";
import { ICAL_REASON_CODES } from "./icalReasonCodes";

function uniqueReasonCodes(codes: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const code of codes) {
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
    if (out.length >= ICAL_MAP_LIMITS.maxSecondaryReasonCodes) {
      break;
    }
  }
  return out;
}

function classification(
  evidenceKind: IcalEvidenceKind,
  primaryCategory: UnknownCategory | null,
  reasonCodes: readonly string[],
): IcalClassification {
  return {
    evidenceKind,
    primaryCategory,
    reasonCodes: uniqueReasonCodes(reasonCodes),
  };
}

/**
 * Deterministic per-entry classification with fixed precedence.
 */
export function classifyIcalSnapshotEntry(
  entry: IcalSnapshotEntry,
  duplicateGroup: boolean,
): IcalClassification {
  const { equalityFlags, flags, status, identityKind } = entry;

  // 1. identity invalid
  if (
    equalityFlags.identityInvalid ||
    identityKind === "anonymous_hashed_uid" ||
    equalityFlags.duplicateUidProperty
  ) {
    const reasons: string[] = [];
    if (identityKind === "anonymous_hashed_uid") {
      reasons.push(ICAL_REASON_CODES.UID_OVER_LIMIT);
    }
    if (equalityFlags.duplicateUidProperty) {
      reasons.push(ICAL_REASON_CODES.DUPLICATE_UID_PROPERTY);
    }
    if (identityKind === "anonymous") {
      reasons.push(ICAL_REASON_CODES.ANONYMOUS_IDENTITY);
    }
    return classification("unknown", "malformed_identity", reasons);
  }

  // 2. duplicate identity group
  if (duplicateGroup) {
    return classification("unknown", "duplicate_uid", [ICAL_REASON_CODES.DUPLICATE_GROUP]);
  }

  // 3. unsupported recurrence/parser structure
  if (
    equalityFlags.recurrenceUnsupported ||
    equalityFlags.multipleRrule ||
    equalityFlags.unsupportedFeature
  ) {
    const reasons: string[] = [];
    if (equalityFlags.multipleRrule) {
      reasons.push(ICAL_REASON_CODES.MULTIPLE_RRULE);
    }
    if (equalityFlags.unsupportedFeature) {
      reasons.push(ICAL_REASON_CODES.UNSUPPORTED_FEATURE);
    }
    if (flags.hasRrule) {
      reasons.push(ICAL_REASON_CODES.RRULE_PRESENT);
    }
    if (flags.hasRdate) {
      reasons.push(ICAL_REASON_CODES.RDATE_PRESENT);
    }
    if (flags.hasExdate) {
      reasons.push(ICAL_REASON_CODES.EXDATE_PRESENT);
    }
    const category: UnknownCategory =
      equalityFlags.multipleRrule || flags.hasRrule
        ? "unsupported_vevent_feature"
        : "parser_limitation";
    return classification("unknown", category, reasons);
  }

  if (flags.hasRdate || flags.hasExdate) {
    const reasons: string[] = [];
    if (flags.hasRdate) {
      reasons.push(ICAL_REASON_CODES.RDATE_PRESENT);
    }
    if (flags.hasExdate) {
      reasons.push(ICAL_REASON_CODES.EXDATE_PRESENT);
    }
    return classification("unknown", "unsupported_vevent_feature", reasons);
  }

  // 4. invalid/unresolved required time
  if (equalityFlags.timeInvalid || entry.interval === null) {
    const reasons: string[] = [ICAL_REASON_CODES.UNRESOLVED_INTERVAL];
    if (flags.durationPresent) {
      reasons.push(ICAL_REASON_CODES.MISSING_DTEND);
    }
    return classification("unknown", "malformed_time", reasons);
  }

  // 5. STATUS=CANCELLED
  if (status === "CANCELLED") {
    return classification("unknown", "cancellation_unproven", [ICAL_REASON_CODES.STATUS_CANCELLED]);
  }

  // 6. RRULE recurring master
  if (flags.hasRrule) {
    return classification("unknown", "recurring_master", [ICAL_REASON_CODES.RRULE_PRESENT]);
  }

  // 7. RECURRENCE-ID instance
  if (flags.hasRecurrenceId) {
    const reasons: string[] = [ICAL_REASON_CODES.RECURRENCE_ID_PRESENT];
    if (equalityFlags.recurrenceIdentityHashed) {
      reasons.push(ICAL_REASON_CODES.RECURRENCE_IDENTITY_HASHED);
    }
    return classification("unknown", "recurrence_instance_unsupported", reasons);
  }

  // 8. clean candidate
  if (entry.interval !== null) {
    return classification("availability_block_candidate", "inventory_block", [
      ICAL_REASON_CODES.RESOLVABLE_INTERVAL,
    ]);
  }

  return classification("unknown", "ambiguous_reservation", [ICAL_REASON_CODES.AMBIGUOUS_RESERVATION]);
}

export { ICAL_MAP_LIMITS } from "./icalMapLimits";
export type { IcalMapLimitKey } from "./icalMapLimits";

export { IcalMapError, isIcalMapError } from "./icalMapErrors";
export type { IcalMapErrorCode } from "./icalMapErrors";

export { ICAL_MAP_ISSUE_CODES } from "./icalMapIssueCodes";
export type { IcalMapIssue, IcalMapIssueCode } from "./icalMapIssueCodes";

export type {
  IcalCursorDecodeResult,
  IcalCursorUnsupportedField,
  IcalDecodedIdentity,
  IcalDigestGroup,
  IcalDigestIndex,
  IcalEndSource,
  IcalEqualityFlags,
  IcalIdentityKind,
  IcalSnapshotEntry,
  IcalSnapshotGroup,
  IcalSnapshotIndex,
  IcalSnapshotInterval,
  IcalStructuralFlags,
} from "./icalMapTypes";

export {
  ICAL_CURSOR_CODEC_VERSION,
  ICAL_ENTRY_HASH_VERSION,
  ICAL_IDENTITY_CODEC_VERSION,
  ICAL_SNAPSHOT_HASH_VERSION,
  ICAL_SNAPSHOT_SCHEMA_VERSION,
} from "./icalMapTypes";

export { buildIcalSnapshotIndex } from "./buildIcalSnapshotIndex";
export { toIcalDigestIndex } from "./toIcalDigestIndex";
export { encodeIcalCursor } from "./encodeIcalCursor";
export { decodeIcalCursor } from "./decodeIcalCursor";
export {
  EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD,
  buildEmptyIcalCursorBaselinePayload,
} from "./icalEmptyCursorBaseline";
export { decodeIcalIdentityKey } from "./icalIdentityCodec";


export {
  ICAL_ISSUE_OWNERSHIP_V1,
  assertIssueMappingComplete,
  encodeEqualityBitfield,
} from "./icalEqualityFlags";

export type { IcalSnapshotDiff, IcalSnapshotGroupChange } from "./icalDiffTypes";
export { diffIcalSnapshotIndexes, entriesForSnapshotGroup } from "./diffIcalSnapshotIndexes";

export type {
  IcalClassification,
  IcalClassificationResult,
  IcalEvidenceKind,
  IcalMapInput,
  IcalMappedEvidenceBatch,
  IcalMappedEvidenceRecord,
  IcalMappedRecord,
  IcalMappedRemovedEvidenceRecord,
} from "./icalEvidenceTypes";
export { classifyIcalSnapshotDiff } from "./classifyIcalSnapshotDiff";
export { classifyIcalSnapshotEntry } from "./icalClassification";
export { mapIcalCalendar } from "./mapIcalCalendar";
export { ICAL_REASON_CODES } from "./icalReasonCodes";
export type { IcalReasonCode } from "./icalReasonCodes";
export {
  providerEventIdFromEntry,
  providerEventIdFromIdentityKey,
  resolveProviderEventId,
} from "./icalProviderEventIdentity";

import type { NormalizedIcalDateTime } from "../parse/icalParseTypes";
import type { IcalMapIssue } from "./icalMapIssueCodes";

export const ICAL_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const ICAL_IDENTITY_CODEC_VERSION = 1 as const;
export const ICAL_ENTRY_HASH_VERSION = 1 as const;
export const ICAL_SNAPSHOT_HASH_VERSION = 1 as const;
export const ICAL_CURSOR_CODEC_VERSION = 1 as const;

export type IcalIdentityKind =
  | "uid_only"
  | "uid_rid"
  | "anonymous"
  | "uid_rid_hashed"
  | "anonymous_hashed_uid";

export type IcalIdentityKindCode = 1 | 2 | 3 | 4 | 5;

export const ICAL_IDENTITY_KIND_CODE = {
  uid_only: 1,
  uid_rid: 2,
  anonymous: 3,
  uid_rid_hashed: 4,
  anonymous_hashed_uid: 5,
} as const satisfies Record<IcalIdentityKind, IcalIdentityKindCode>;

export type IcalEndSource = "dtend" | "unknown";

export interface IcalSnapshotInterval {
  readonly start: NormalizedIcalDateTime;
  readonly end: NormalizedIcalDateTime;
  readonly endSource: "dtend";
  readonly resolvable: true;
}

export interface IcalStructuralFlags {
  readonly hasRrule: boolean;
  readonly hasRdate: boolean;
  readonly hasExdate: boolean;
  readonly hasRecurrenceId: boolean;
  readonly durationPresent: boolean;
}

export interface IcalEqualityFlags {
  readonly identityInvalid: boolean;
  readonly duplicateUidProperty: boolean;
  readonly timeInvalid: boolean;
  readonly recurrenceUnsupported: boolean;
  readonly multipleRrule: boolean;
  readonly unsupportedFeature: boolean;
  readonly recurrenceIdentityHashed: boolean;
}

export interface IcalSnapshotEntry {
  readonly identityKey: string;
  readonly identityKind: IcalIdentityKind;
  readonly providerEventId: string | null;
  readonly sequence: number | null;
  readonly status: string | null;
  readonly interval: IcalSnapshotInterval | null;
  readonly entryContentHash: string;
  readonly flags: IcalStructuralFlags;
  readonly equalityFlags: IcalEqualityFlags;
  readonly rruleDigests: readonly string[];
  readonly rdateDigests: readonly string[];
  readonly exdateDigests: readonly string[];
  readonly durationDigests: readonly string[];
  readonly sourceEventIndex: number;
  readonly componentIndex: number;
}

export interface IcalSnapshotGroup {
  readonly identityKey: string;
  readonly entryIndexes: readonly number[];
  readonly entryContentHashes: readonly string[];
}

export interface IcalSnapshotIndex {
  readonly schemaVersion: typeof ICAL_SNAPSHOT_SCHEMA_VERSION;
  readonly identityCodecVersion: typeof ICAL_IDENTITY_CODEC_VERSION;
  readonly entryHashVersion: typeof ICAL_ENTRY_HASH_VERSION;
  readonly snapshotHashVersion: typeof ICAL_SNAPSHOT_HASH_VERSION;
  readonly snapshotHash: string;
  readonly entries: readonly IcalSnapshotEntry[];
  readonly groups: readonly IcalSnapshotGroup[];
  readonly calendarMeta: {
    readonly prodid: string | null;
    readonly version: string | null;
    readonly calscale: string | null;
    readonly method: string | null;
  };
  readonly mapIssues: readonly IcalMapIssue[];
}

export interface IcalDigestGroup {
  readonly identityKey: string;
  readonly entryContentHashes: readonly string[];
}

export interface IcalDigestIndex {
  readonly cursorCodecVersion: typeof ICAL_CURSOR_CODEC_VERSION;
  readonly snapshotSchemaVersion: typeof ICAL_SNAPSHOT_SCHEMA_VERSION;
  readonly identityCodecVersion: typeof ICAL_IDENTITY_CODEC_VERSION;
  readonly entryHashVersion: typeof ICAL_ENTRY_HASH_VERSION;
  readonly snapshotHashVersion: typeof ICAL_SNAPSHOT_HASH_VERSION;
  readonly snapshotHash: string;
  readonly groups: readonly IcalDigestGroup[];
}

export type IcalCursorUnsupportedField = "v" | "ss" | "iv" | "eh" | "sh";

export type IcalCursorDecodeResult =
  | { status: "absent" }
  | { status: "valid"; index: IcalDigestIndex }
  | { status: "invalid"; issueCode: "CURSOR_INVALID" }
  | {
      status: "unsupported";
      issueCode: "CURSOR_UNSUPPORTED_VERSION";
      unsupportedField: IcalCursorUnsupportedField;
    };

export type IcalDecodedIdentity =
  | {
      kind: "uid_only";
      uid: string;
      providerEventId: string;
      recurrenceId: null;
      recurrenceIdentityHashed: false;
    }
  | {
      kind: "uid_rid";
      uid: string;
      providerEventId: string;
      recurrenceId: NormalizedIcalDateTime;
      recurrenceIdentityHashed: false;
    }
  | {
      kind: "uid_rid_hashed";
      uid: string;
      providerEventId: string;
      recurrenceId: null;
      recurrenceIdentityHashed: true;
      temporalDigestHex: string;
    }
  | {
      kind: "anonymous" | "anonymous_hashed_uid";
      uid: null;
      providerEventId: null;
      recurrenceId: null;
      recurrenceIdentityHashed: boolean;
      fingerprintHex: string;
    };

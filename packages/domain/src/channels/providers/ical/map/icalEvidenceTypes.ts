import type { UnknownCategory } from "../../../types/UnknownTaxonomy";
import type { IcalMapIssue } from "./icalMapIssueCodes";
import type { IcalSnapshotDiff } from "./icalDiffTypes";
import type { IcalSnapshotInterval } from "./icalMapTypes";
import type { NormalizedIcalCalendar } from "../parse/icalParseTypes";

export type IcalEvidenceKind =
  | "unknown"
  | "availability_block_candidate"
  | "reservation_candidate"
  | "ignored";

export interface IcalClassification {
  readonly evidenceKind: IcalEvidenceKind;
  readonly primaryCategory: UnknownCategory | null;
  readonly reasonCodes: readonly string[];
}

export interface IcalMappedEvidenceRecord {
  readonly change: "added" | "updated";
  readonly identityKey: string;
  readonly providerEventId: string | null;
  readonly entryContentHash: string;
  readonly interval: IcalSnapshotInterval | null;
  readonly evidenceKind: IcalEvidenceKind;
  readonly primaryCategory: UnknownCategory | null;
  readonly reasonCodes: readonly string[];
}

export interface IcalMappedRemovedEvidenceRecord {
  readonly change: "removed";
  readonly identityKey: string;
  readonly providerEventId: string | null;
  readonly previousEntryContentHash: string;
  readonly evidenceKind: "unknown";
  readonly primaryCategory: "cancellation_unproven";
  readonly reasonCodes: readonly string[];
}

export type IcalMappedRecord = IcalMappedEvidenceRecord | IcalMappedRemovedEvidenceRecord;

export interface IcalMappedEvidenceBatch {
  readonly snapshotHash: string;
  readonly diff: IcalSnapshotDiff;
  readonly records: readonly IcalMappedRecord[];
  readonly mapIssues: readonly IcalMapIssue[];
  readonly proposedCursorPayload: string;
  /** Number of identity groups classified as added. Not the number of emitted evidence records. */
  readonly addedCount: number;
  /** Number of identity groups classified as updated. Not the number of emitted evidence records. */
  readonly updatedCount: number;
  /** Number of identity groups classified as removed. Not the number of emitted evidence records. */
  readonly removedCount: number;
  /** Number of identity groups classified as unchanged. Not the number of emitted evidence records. */
  readonly unchangedCount: number;
}

export interface IcalMapInput {
  readonly calendar: NormalizedIcalCalendar;
  readonly previousCursorPayload: string | null;
}

export interface IcalClassificationResult {
  readonly records: readonly IcalMappedRecord[];
}

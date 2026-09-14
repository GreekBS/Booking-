import { classifyIcalSnapshotEntry } from "./icalClassification";
import { entriesForSnapshotGroup } from "./diffIcalSnapshotIndexes";
import type { IcalSnapshotDiff } from "./icalDiffTypes";
import type { IcalClassificationResult, IcalMappedRecord } from "./icalEvidenceTypes";
import type { IcalSnapshotIndex } from "./icalMapTypes";
import { providerEventIdFromEntry, providerEventIdFromIdentityKey } from "./icalProviderEventIdentity";
import { ICAL_REASON_CODES } from "./icalReasonCodes";

function isDuplicateGroup(entryCount: number): boolean {
  return entryCount > 1;
}

/**
 * Build actionable mapped evidence records from a snapshot diff.
 * Unchanged groups produce no records.
 */
export function classifyIcalSnapshotDiff(
  diff: IcalSnapshotDiff,
  current: IcalSnapshotIndex,
): IcalClassificationResult {
  const records: IcalMappedRecord[] = [];

  for (const change of diff.changes) {
    if (change.change === "unchanged") {
      continue;
    }

    if (change.change === "removed") {
      const providerEventId = providerEventIdFromIdentityKey(change.identityKey);
      for (const previousEntryContentHash of change.previous.entryContentHashes) {
        records.push({
          change: "removed",
          identityKey: change.identityKey,
          providerEventId,
          previousEntryContentHash,
          evidenceKind: "unknown",
          primaryCategory: "cancellation_unproven",
          reasonCodes: [ICAL_REASON_CODES.REMOVED_FROM_FEED],
        });
      }
      continue;
    }

    const entries = entriesForSnapshotGroup(current, change.current);
    const duplicateGroup = isDuplicateGroup(entries.length);
    for (const entry of entries) {
      const classified = classifyIcalSnapshotEntry(entry, duplicateGroup);
      records.push({
        change: change.change,
        identityKey: change.identityKey,
        providerEventId: providerEventIdFromEntry(entry),
        entryContentHash: entry.entryContentHash,
        interval: entry.interval,
        evidenceKind: classified.evidenceKind,
        primaryCategory: classified.primaryCategory,
        reasonCodes: classified.reasonCodes,
      });
    }
  }

  records.sort(compareRecords);
  return { records };
}

function compareRecords(a: IcalMappedRecord, b: IcalMappedRecord): number {
  if (a.identityKey !== b.identityKey) {
    return a.identityKey < b.identityKey ? -1 : 1;
  }
  const aHash = a.change === "removed" ? a.previousEntryContentHash : a.entryContentHash;
  const bHash = b.change === "removed" ? b.previousEntryContentHash : b.entryContentHash;
  if (aHash !== bHash) {
    return aHash < bHash ? -1 : 1;
  }
  const changeOrder = { added: 0, updated: 1, removed: 2 } as const;
  return changeOrder[a.change] - changeOrder[b.change];
}

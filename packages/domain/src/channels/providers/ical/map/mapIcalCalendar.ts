import { buildIcalSnapshotIndex } from "./buildIcalSnapshotIndex";
import { classifyIcalSnapshotDiff } from "./classifyIcalSnapshotDiff";
import { decodeIcalCursor } from "./decodeIcalCursor";
import { diffIcalSnapshotIndexes } from "./diffIcalSnapshotIndexes";
import { encodeIcalCursor } from "./encodeIcalCursor";
import type { IcalMapInput, IcalMappedEvidenceBatch } from "./icalEvidenceTypes";
import { IcalMapError, wrapIcalMapBoundaryError } from "./icalMapErrors";
import type { IcalMapIssue } from "./icalMapIssueCodes";
import { ICAL_MAP_LIMITS } from "./icalMapLimits";
import type { IcalDigestIndex } from "./icalMapTypes";
import { toIcalDigestIndex } from "./toIcalDigestIndex";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  for (const key of Reflect.ownKeys(value as object)) {
    deepFreeze((value as Record<string | symbol, unknown>)[key]);
  }
  return Object.freeze(value);
}

/**
 * Pure map façade: snapshot build → diff → classify → proposed cursor.
 * Does not persist cursors, write Inbox, or construct ChannelProviderMessage.
 */
export function mapIcalCalendar(input: IcalMapInput): IcalMappedEvidenceBatch {
  try {
    return mapIcalCalendarInner(input);
  } catch (error) {
    wrapIcalMapBoundaryError(error);
  }
}

function mapIcalCalendarInner(input: IcalMapInput): IcalMappedEvidenceBatch {
  const mapIssues: IcalMapIssue[] = [];
  const decoded = decodeIcalCursor(input.previousCursorPayload);

  let previousDigest: IcalDigestIndex | null = null;
  if (decoded.status === "valid") {
    previousDigest = decoded.index;
  } else if (decoded.status === "invalid") {
    mapIssues.push({ code: "CURSOR_INVALID" });
  } else if (decoded.status === "unsupported") {
    mapIssues.push({ code: "CURSOR_UNSUPPORTED_VERSION" });
  }

  const currentSnapshot = buildIcalSnapshotIndex(input.calendar);
  const diff = diffIcalSnapshotIndexes(previousDigest, currentSnapshot);
  const { records } = classifyIcalSnapshotDiff(diff, currentSnapshot);

  const currentDigest = toIcalDigestIndex(currentSnapshot);
  const proposedCursorPayload = encodeIcalCursor(currentDigest);

  const batch: IcalMappedEvidenceBatch = {
    snapshotHash: currentSnapshot.snapshotHash,
    diff,
    records,
    mapIssues: [...currentSnapshot.mapIssues, ...mapIssues].slice(0, ICAL_MAP_LIMITS.maxMapIssues),
    proposedCursorPayload,
    addedCount: diff.addedCount,
    updatedCount: diff.updatedCount,
    removedCount: diff.removedCount,
    unchangedCount: diff.unchangedCount,
  };

  if (batch.records.length > ICAL_MAP_LIMITS.maxTotalDigests) {
    throw new IcalMapError(
      "ICAL_MAP_LIMIT_EXCEEDED",
      "Mapped evidence record count exceeded hard limit",
      { limitKey: "maxTotalDigests" },
    );
  }

  return deepFreeze(batch);
}

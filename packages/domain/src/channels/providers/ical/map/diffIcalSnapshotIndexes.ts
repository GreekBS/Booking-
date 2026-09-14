import type { IcalDigestGroup, IcalDigestIndex, IcalSnapshotGroup, IcalSnapshotIndex } from "./icalMapTypes";
import type { IcalSnapshotDiff, IcalSnapshotGroupChange } from "./icalDiffTypes";

function hashMultisetsEqual(
  previous: readonly string[],
  current: readonly string[],
): boolean {
  if (previous.length !== current.length) {
    return false;
  }
  for (let i = 0; i < previous.length; i += 1) {
    if (previous[i] !== current[i]) {
      return false;
    }
  }
  return true;
}

function digestGroupFromSnapshotGroup(group: IcalSnapshotGroup): IcalDigestGroup {
  return {
    identityKey: group.identityKey,
    entryContentHashes: group.entryContentHashes,
  };
}

function buildUnchangedChanges(
  previous: IcalDigestIndex,
  current: IcalSnapshotIndex,
): IcalSnapshotGroupChange[] {
  const previousByKey = new Map(previous.groups.map((group) => [group.identityKey, group]));
  const changes: IcalSnapshotGroupChange[] = [];
  for (const currentGroup of current.groups) {
    const previousGroup = previousByKey.get(currentGroup.identityKey);
    if (previousGroup === undefined) {
      changes.push({
        change: "added",
        identityKey: currentGroup.identityKey,
        current: currentGroup,
      });
      continue;
    }
    changes.push({
      change: "unchanged",
      identityKey: currentGroup.identityKey,
      previous: previousGroup,
      current: currentGroup,
    });
  }
  for (const previousGroup of previous.groups) {
    if (!current.groups.some((group) => group.identityKey === previousGroup.identityKey)) {
      changes.push({
        change: "removed",
        identityKey: previousGroup.identityKey,
        previous: previousGroup,
      });
    }
  }
  changes.sort((a, b) => (a.identityKey < b.identityKey ? -1 : a.identityKey > b.identityKey ? 1 : 0));
  return changes;
}

/**
 * Deterministic group-level diff between durable previous digest and current snapshot.
 */
export function diffIcalSnapshotIndexes(
  previous: IcalDigestIndex | null,
  current: IcalSnapshotIndex,
): IcalSnapshotDiff {
  if (previous === null) {
    const changes: IcalSnapshotGroupChange[] = current.groups.map((group) => ({
      change: "added" as const,
      identityKey: group.identityKey,
      current: group,
    }));
    return finalizeDiff(null, current.snapshotHash, changes);
  }

  if (previous.snapshotHash === current.snapshotHash) {
    const changes = buildUnchangedChanges(previous, current);
    return finalizeDiff(previous.snapshotHash, current.snapshotHash, changes);
  }

  const previousByKey = new Map(previous.groups.map((group) => [group.identityKey, group]));
  const currentByKey = new Map(current.groups.map((group) => [group.identityKey, group]));
  const identityKeys = [
    ...new Set([...previousByKey.keys(), ...currentByKey.keys()]),
  ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const changes: IcalSnapshotGroupChange[] = [];
  for (const identityKey of identityKeys) {
    const previousGroup = previousByKey.get(identityKey);
    const currentGroup = currentByKey.get(identityKey);
    if (previousGroup === undefined && currentGroup !== undefined) {
      changes.push({ change: "added", identityKey, current: currentGroup });
    } else if (previousGroup !== undefined && currentGroup === undefined) {
      changes.push({ change: "removed", identityKey, previous: previousGroup });
    } else if (previousGroup !== undefined && currentGroup !== undefined) {
      if (hashMultisetsEqual(previousGroup.entryContentHashes, currentGroup.entryContentHashes)) {
        changes.push({ change: "unchanged", identityKey, previous: previousGroup, current: currentGroup });
      } else {
        changes.push({ change: "updated", identityKey, previous: previousGroup, current: currentGroup });
      }
    }
  }

  return finalizeDiff(previous.snapshotHash, current.snapshotHash, changes);
}

function finalizeDiff(
  previousSnapshotHash: string | null,
  currentSnapshotHash: string,
  changes: readonly IcalSnapshotGroupChange[],
): IcalSnapshotDiff {
  let addedCount = 0;
  let updatedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;
  for (const change of changes) {
    switch (change.change) {
      case "added":
        addedCount += 1;
        break;
      case "updated":
        updatedCount += 1;
        break;
      case "removed":
        removedCount += 1;
        break;
      case "unchanged":
        unchangedCount += 1;
        break;
      default:
        break;
    }
  }
  return {
    previousSnapshotHash,
    currentSnapshotHash,
    changes,
    addedCount,
    updatedCount,
    removedCount,
    unchangedCount,
  };
}

export function entriesForSnapshotGroup(
  snapshot: IcalSnapshotIndex,
  group: IcalSnapshotGroup,
): readonly import("./icalMapTypes").IcalSnapshotEntry[] {
  return group.entryIndexes
    .map((index) => snapshot.entries[index]!)
    .slice()
    .sort((a, b) =>
      a.entryContentHash < b.entryContentHash
        ? -1
        : a.entryContentHash > b.entryContentHash
          ? 1
          : 0,
    );
}

export { digestGroupFromSnapshotGroup };

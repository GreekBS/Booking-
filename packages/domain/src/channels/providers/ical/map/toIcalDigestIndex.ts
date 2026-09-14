import type { IcalDigestIndex, IcalSnapshotIndex } from "./icalMapTypes";
import {
  ICAL_CURSOR_CODEC_VERSION,
  ICAL_ENTRY_HASH_VERSION,
  ICAL_IDENTITY_CODEC_VERSION,
  ICAL_SNAPSHOT_HASH_VERSION,
  ICAL_SNAPSHOT_SCHEMA_VERSION,
} from "./icalMapTypes";

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
 * Compact durable digest state for opaque cursor encoding.
 */
export function toIcalDigestIndex(snapshot: IcalSnapshotIndex): IcalDigestIndex {
  return deepFreeze({
    cursorCodecVersion: ICAL_CURSOR_CODEC_VERSION,
    snapshotSchemaVersion: ICAL_SNAPSHOT_SCHEMA_VERSION,
    identityCodecVersion: ICAL_IDENTITY_CODEC_VERSION,
    entryHashVersion: ICAL_ENTRY_HASH_VERSION,
    snapshotHashVersion: ICAL_SNAPSHOT_HASH_VERSION,
    snapshotHash: snapshot.snapshotHash,
    groups: snapshot.groups.map((group) => ({
      identityKey: group.identityKey,
      entryContentHashes: group.entryContentHashes,
    })),
  });
}

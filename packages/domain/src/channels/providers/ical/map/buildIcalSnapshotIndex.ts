import type { NormalizedIcalCalendar, NormalizedIcalEvent } from "../parse/icalParseTypes";
import {
  applyParserIssuesToEqualityFlags,
  emptyEqualityFlags,
} from "./icalEqualityFlags";
import { buildEventIdentity } from "./icalIdentityCodec";
import { resolveStructuralInterval } from "./icalInterval";
import { IcalMapError, wrapIcalMapBoundaryError } from "./icalMapErrors";
import type { IcalMapIssue } from "./icalMapIssueCodes";
import { ICAL_MAP_LIMITS } from "./icalMapLimits";
import type { IcalSnapshotEntry, IcalSnapshotIndex } from "./icalMapTypes";
import {
  ICAL_ENTRY_HASH_VERSION,
  ICAL_IDENTITY_CODEC_VERSION,
  ICAL_SNAPSHOT_HASH_VERSION,
  ICAL_SNAPSHOT_SCHEMA_VERSION,
} from "./icalMapTypes";
import {
  collectPropertyDigests,
  countNamedProperties,
  hasNamedProperty,
} from "./icalPropertyDigest";
import { buildCanonicalGroups, computeEntryContentHash, computeSnapshotHash } from "./icalSnapshotHash";

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
 * Build a frozen snapshot/index from a normalized calendar.
 * Pure: no I/O, no taxonomy classification, no cursor persistence.
 */
export function buildIcalSnapshotIndex(calendar: NormalizedIcalCalendar): IcalSnapshotIndex {
  try {
    return buildIcalSnapshotIndexInner(calendar);
  } catch (error) {
    wrapIcalMapBoundaryError(error);
  }
}

function buildIcalSnapshotIndexInner(calendar: NormalizedIcalCalendar): IcalSnapshotIndex {
  if (calendar.events.length > ICAL_MAP_LIMITS.maxEntries) {
    throw new IcalMapError(
      "ICAL_MAP_LIMIT_EXCEEDED",
      "Snapshot entry count exceeded hard limit",
      { limitKey: "maxEntries" },
    );
  }

  const mapIssues: IcalMapIssue[] = [];
  const entries: IcalSnapshotEntry[] = calendar.events.map((event) =>
    buildEntry(event, mapIssues),
  );

  const groups = buildCanonicalGroups(entries);
  if (groups.length > ICAL_MAP_LIMITS.maxGroups) {
    throw new IcalMapError(
      "ICAL_MAP_LIMIT_EXCEEDED",
      "Snapshot group count exceeded hard limit",
      { limitKey: "maxGroups" },
    );
  }

  const snapshotHash = computeSnapshotHash(groups);

  const snapshot: IcalSnapshotIndex = {
    schemaVersion: ICAL_SNAPSHOT_SCHEMA_VERSION,
    identityCodecVersion: ICAL_IDENTITY_CODEC_VERSION,
    entryHashVersion: ICAL_ENTRY_HASH_VERSION,
    snapshotHashVersion: ICAL_SNAPSHOT_HASH_VERSION,
    snapshotHash,
    entries,
    groups,
    calendarMeta: {
      prodid: calendar.prodid,
      version: calendar.version,
      calscale: calendar.calscale,
      method: calendar.method,
    },
    mapIssues: mapIssues.slice(0, ICAL_MAP_LIMITS.maxMapIssues),
  };

  return deepFreeze(snapshot);
}

function buildEntry(
  event: NormalizedIcalEvent,
  mapIssues: IcalMapIssue[],
): IcalSnapshotEntry {
  const flags = {
    hasRrule: hasNamedProperty(event.properties, "RRULE"),
    hasRdate: hasNamedProperty(event.properties, "RDATE"),
    hasExdate: hasNamedProperty(event.properties, "EXDATE"),
    hasRecurrenceId: event.recurrenceId !== null,
    durationPresent: countNamedProperties(event.properties, "DURATION") > 0,
  };

  let equalityFlags = applyParserIssuesToEqualityFlags(event.issues, emptyEqualityFlags());
  const interval = resolveStructuralInterval(event);
  if (interval === null) {
    equalityFlags = { ...equalityFlags, timeInvalid: true };
  }

  const rruleDigests = collectPropertyDigests(event.properties, "RRULE");
  const rdateDigests = collectPropertyDigests(event.properties, "RDATE");
  const exdateDigests = collectPropertyDigests(event.properties, "EXDATE");
  const durationDigests = collectPropertyDigests(event.properties, "DURATION");

  const identity = buildEventIdentity({
    uid: event.uid,
    recurrenceId: event.recurrenceId,
    interval,
    flags,
    equalityFlags,
  });
  equalityFlags = identity.equalityFlags;

  if (identity.identityKind === "anonymous_hashed_uid") {
    mapIssues.push({
      code: "MAP_ENTRY_IDENTITY_OVERFLOW",
      eventIndex: event.eventIndex,
    });
  }
  if (identity.equalityFlags.recurrenceIdentityHashed) {
    mapIssues.push({
      code: "MAP_TEMPORAL_IDENTITY_HASHED",
      eventIndex: event.eventIndex,
    });
  }

  const entryContentHash = computeEntryContentHash({
    sequence: event.sequence,
    status: event.status,
    interval,
    flags,
    rruleDigests,
    rdateDigests,
    exdateDigests,
    durationDigests,
    equalityFlags,
  });

  return {
    identityKey: identity.identityKey,
    identityKind: identity.identityKind,
    providerEventId: identity.providerEventId,
    sequence: event.sequence,
    status: event.status,
    interval,
    entryContentHash,
    flags,
    equalityFlags,
    rruleDigests,
    rdateDigests,
    exdateDigests,
    durationDigests,
    sourceEventIndex: event.eventIndex,
    componentIndex: event.componentIndex,
  };
}

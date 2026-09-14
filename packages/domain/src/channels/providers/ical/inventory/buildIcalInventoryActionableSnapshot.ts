/**
 * Provider-1 P1-S6a — FULL DATE actionable inventory projection.
 * P1-S7a — also records observed + cancelled identity evidence for authoritative removal.
 * Stricter than S4b classification; does not mutate S4a/S4b semantics.
 */

import { utf8ByteLength } from "../../../utils/sha256Hex";
import { ICAL_MAP_LIMITS } from "../map/icalMapLimits";
import type { IcalIdentityKind, IcalSnapshotEntry, IcalSnapshotIndex } from "../map/icalMapTypes";

export const ICAL_INVENTORY_ACTIONABLE_SNAPSHOT_HARD_CAP_UTF8_BYTES =
  ICAL_MAP_LIMITS.maxCursorPayloadUtf8Bytes;

export const ICAL_INVENTORY_ACTIONABLE_MAX_ITEMS = ICAL_MAP_LIMITS.maxEntries;

/** Approved capacity proof constants (architecture lock; measured encoding). */
export const ICAL_INVENTORY_CAPACITY = {
  maxIdentityKeyBytes: ICAL_MAP_LIMITS.maxIdentityBase64urlBytes,
  entryHashBytes: 64,
  kindDigitBytes: 1,
  dateBytes: 10,
  /** Compact JSON punctuation + key labels for one item (`{"i":"","h":"","k":1,"s":"","e":""}` = 35). */
  fixedJsonOverheadBytes: 35,
  maxItemUtf8Bytes: 443,
  maxItems: ICAL_INVENTORY_ACTIONABLE_MAX_ITEMS,
  maxItemsPayloadUtf8Bytes: 2_215_000,
  arrayPunctuationUtf8Bytes: 5_001,
  worstCaseSnapshotUtf8Bytes: 2_220_001,
  hardCapUtf8Bytes: ICAL_INVENTORY_ACTIONABLE_SNAPSHOT_HARD_CAP_UTF8_BYTES,
  safetyMarginUtf8Bytes: 401_439,
} as const;

export type IcalInventoryActionableIdentityKind = "uid_only" | "uid_rid";

export interface IcalInventoryActionableItem {
  readonly sourceIdentityKey: string;
  readonly entryContentHash: string;
  readonly identityKind: IcalInventoryActionableIdentityKind;
  readonly checkIn: string;
  readonly checkOut: string;
}

export interface IcalInventoryActionableSnapshot {
  readonly snapshotHash: string;
  readonly items: readonly IcalInventoryActionableItem[];
  /** Canonical compact JSON array string (no whitespace) — actionable items only. */
  readonly canonicalJson: string;
  readonly utf8ByteLength: number;
  /**
   * P1-S7a: always true when projection succeeds. TX1 persists this so TX2 may
   * absence-deactivate. Legacy rows without the flag must fail closed.
   */
  readonly completeObservedEvidence: true;
  /** Every authoritative snapshot entry identityKey (sorted, unique). */
  readonly observedSourceIdentityKeys: readonly string[];
  /** Identities with explicit STATUS:CANCELLED (sorted, unique). */
  readonly cancelledSourceIdentityKeys: readonly string[];
}

export type IcalInventoryActionableProjectionResult =
  | { readonly ok: true; readonly snapshot: IcalInventoryActionableSnapshot }
  | {
      readonly ok: false;
      readonly code: "CAPACITY_EXCEEDED" | "ITEM_LIMIT_EXCEEDED" | "INVALID_ITEM";
      readonly message: string;
    };

const KIND_CODE: Record<IcalInventoryActionableIdentityKind, 1 | 2> = {
  uid_only: 1,
  uid_rid: 2,
};

function isActionableIdentityKind(
  kind: IcalIdentityKind,
): kind is IcalInventoryActionableIdentityKind {
  return kind === "uid_only" || kind === "uid_rid";
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isInventorySafeEntry(entry: IcalSnapshotEntry, duplicateGroup: boolean): boolean {
  if (duplicateGroup) {
    return false;
  }
  if (!isActionableIdentityKind(entry.identityKind)) {
    return false;
  }
  if (entry.equalityFlags.identityInvalid || entry.equalityFlags.duplicateUidProperty) {
    return false;
  }
  if (
    entry.equalityFlags.recurrenceUnsupported ||
    entry.equalityFlags.multipleRrule ||
    entry.equalityFlags.unsupportedFeature ||
    entry.equalityFlags.timeInvalid
  ) {
    return false;
  }
  if (
    entry.flags.hasRrule ||
    entry.flags.hasRdate ||
    entry.flags.hasExdate ||
    entry.flags.hasRecurrenceId ||
    entry.flags.durationPresent
  ) {
    return false;
  }
  if (entry.status === "CANCELLED") {
    return false;
  }
  const interval = entry.interval;
  if (interval === null || !interval.resolvable) {
    return false;
  }
  if (interval.start.kind !== "date" || interval.end.kind !== "date") {
    return false;
  }
  const checkIn = formatDate(interval.start.year, interval.start.month, interval.start.day);
  const checkOut = formatDate(interval.end.year, interval.end.month, interval.end.day);
  if (checkOut <= checkIn) {
    return false;
  }
  if (!/^[0-9a-f]{64}$/.test(entry.entryContentHash)) {
    return false;
  }
  if (utf8ByteLength(entry.identityKey) > ICAL_MAP_LIMITS.maxIdentityBase64urlBytes) {
    return false;
  }
  return true;
}

function encodeItem(item: IcalInventoryActionableItem): string {
  const k = KIND_CODE[item.identityKind];
  return `{"i":"${item.sourceIdentityKey}","h":"${item.entryContentHash}","k":${k},"s":"${item.checkIn}","e":"${item.checkOut}"}`;
}

function buildObservedEvidence(snapshot: IcalSnapshotIndex):
  | {
      readonly observedSourceIdentityKeys: string[];
      readonly cancelledSourceIdentityKeys: string[];
    }
  | {
      readonly ok: false;
      readonly code: "ITEM_LIMIT_EXCEEDED" | "CAPACITY_EXCEEDED";
      readonly message: string;
    } {
  const observed = new Set<string>();
  const cancelled = new Set<string>();

  for (const entry of snapshot.entries) {
    if (utf8ByteLength(entry.identityKey) > ICAL_MAP_LIMITS.maxIdentityBase64urlBytes) {
      return {
        ok: false,
        code: "CAPACITY_EXCEEDED",
        message: "Observed inventory identity exceeded max identity key size",
      };
    }
    observed.add(entry.identityKey);
    if (entry.status === "CANCELLED") {
      cancelled.add(entry.identityKey);
    }
  }

  if (observed.size > ICAL_INVENTORY_ACTIONABLE_MAX_ITEMS) {
    return {
      ok: false,
      code: "ITEM_LIMIT_EXCEEDED",
      message: `Observed inventory identities exceeded ${ICAL_INVENTORY_ACTIONABLE_MAX_ITEMS}`,
    };
  }

  const observedSourceIdentityKeys = [...observed].sort();
  const cancelledSourceIdentityKeys = [...cancelled].sort();

  const evidenceJson = JSON.stringify({
    o: observedSourceIdentityKeys,
    c: cancelledSourceIdentityKeys,
  });
  if (utf8ByteLength(evidenceJson) > ICAL_INVENTORY_ACTIONABLE_SNAPSHOT_HARD_CAP_UTF8_BYTES) {
    return {
      ok: false,
      code: "CAPACITY_EXCEEDED",
      message: `Observed inventory evidence exceeded hard UTF-8 cap ${ICAL_INVENTORY_ACTIONABLE_SNAPSHOT_HARD_CAP_UTF8_BYTES}`,
    };
  }

  return { observedSourceIdentityKeys, cancelledSourceIdentityKeys };
}

/**
 * Build FULL current actionable inventory snapshot from IcalSnapshotIndex.
 * Independent of S4b diff records / Inbox messages.
 * P1-S7a: also returns complete observed/cancelled identity evidence.
 */
export function buildIcalInventoryActionableSnapshot(
  snapshot: IcalSnapshotIndex,
): IcalInventoryActionableProjectionResult {
  const evidence = buildObservedEvidence(snapshot);
  if ("ok" in evidence) {
    return evidence;
  }

  const items: IcalInventoryActionableItem[] = [];

  for (const group of snapshot.groups) {
    const duplicateGroup = group.entryIndexes.length !== 1;
    if (duplicateGroup) {
      continue;
    }
    const entryIndex = group.entryIndexes[0];
    if (entryIndex === undefined) {
      continue;
    }
    const entry = snapshot.entries[entryIndex];
    if (!entry) {
      continue;
    }
    if (!isInventorySafeEntry(entry, false)) {
      continue;
    }
    const interval = entry.interval!;
    items.push({
      sourceIdentityKey: entry.identityKey,
      entryContentHash: entry.entryContentHash,
      identityKind: entry.identityKind as IcalInventoryActionableIdentityKind,
      checkIn: formatDate(interval.start.year, interval.start.month, interval.start.day),
      checkOut: formatDate(interval.end.year, interval.end.month, interval.end.day),
    });
  }

  items.sort((a, b) => {
    if (a.sourceIdentityKey < b.sourceIdentityKey) return -1;
    if (a.sourceIdentityKey > b.sourceIdentityKey) return 1;
    if (a.entryContentHash < b.entryContentHash) return -1;
    if (a.entryContentHash > b.entryContentHash) return 1;
    return 0;
  });

  if (items.length > ICAL_INVENTORY_ACTIONABLE_MAX_ITEMS) {
    return {
      ok: false,
      code: "ITEM_LIMIT_EXCEEDED",
      message: `Actionable inventory snapshot exceeded ${ICAL_INVENTORY_ACTIONABLE_MAX_ITEMS} items`,
    };
  }

  for (const item of items) {
    const encoded = encodeItem(item);
    if (utf8ByteLength(encoded) > ICAL_INVENTORY_CAPACITY.maxItemUtf8Bytes) {
      return {
        ok: false,
        code: "INVALID_ITEM",
        message: "Actionable inventory item exceeded max encoded size",
      };
    }
  }

  const canonicalJson =
    items.length === 0 ? "[]" : `[${items.map((item) => encodeItem(item)).join(",")}]`;
  const size = utf8ByteLength(canonicalJson);
  if (size > ICAL_INVENTORY_ACTIONABLE_SNAPSHOT_HARD_CAP_UTF8_BYTES) {
    return {
      ok: false,
      code: "CAPACITY_EXCEEDED",
      message: `Actionable inventory snapshot exceeded hard UTF-8 cap ${ICAL_INVENTORY_ACTIONABLE_SNAPSHOT_HARD_CAP_UTF8_BYTES}`,
    };
  }

  return {
    ok: true,
    snapshot: {
      snapshotHash: snapshot.snapshotHash,
      items,
      canonicalJson,
      utf8ByteLength: size,
      completeObservedEvidence: true,
      observedSourceIdentityKeys: evidence.observedSourceIdentityKeys,
      cancelledSourceIdentityKeys: evidence.cancelledSourceIdentityKeys,
    },
  };
}

/** Exact max-size golden item for capacity proof tests. */
export function buildMaxSizeActionableItemEncoding(): string {
  const identityKey = "A".repeat(ICAL_MAP_LIMITS.maxIdentityBase64urlBytes);
  const hash = "a".repeat(64);
  return `{"i":"${identityKey}","h":"${hash}","k":1,"s":"9999-12-31","e":"9999-12-31"}`;
}

export function buildWorstCaseActionableSnapshotJson(itemCount: number): string {
  if (itemCount <= 0) {
    return "[]";
  }
  const item = buildMaxSizeActionableItemEncoding();
  return `[${Array.from({ length: itemCount }, () => item).join(",")}]`;
}

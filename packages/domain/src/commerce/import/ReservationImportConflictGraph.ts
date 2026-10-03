import { StayPeriod } from "../shared/value-objects/StayPeriod";

export type ReservationImportConflictNodeKind = "import_row" | "existing_booking";

export interface ReservationImportConflictNode {
  kind: ReservationImportConflictNodeKind;
  /** Import row id or booking id. */
  id: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
}

export interface ReservationImportConflictSnapshot {
  version: 1;
  existingBookingIds: string[];
  peerImportRowIds: string[];
  nonBookingBlockers: Array<{
    blockType: string;
    sourceId: string | null;
    checkIn: string;
    checkOut: string;
    message: string;
  }>;
  overlaps: Array<{
    otherKind: ReservationImportConflictNodeKind;
    otherId: string;
    checkIn: string;
    checkOut: string;
  }>;
}

export function emptyConflictSnapshot(): ReservationImportConflictSnapshot {
  return {
    version: 1,
    existingBookingIds: [],
    peerImportRowIds: [],
    nonBookingBlockers: [],
    overlaps: [],
  };
}

export function parseConflictSnapshot(
  raw: Record<string, unknown> | null | undefined,
): ReservationImportConflictSnapshot {
  if (!raw || raw.version !== 1) {
    return emptyConflictSnapshot();
  }
  const existingBookingIds = Array.isArray(raw.existingBookingIds)
    ? raw.existingBookingIds.filter((v): v is string => typeof v === "string")
    : [];
  const peerImportRowIds = Array.isArray(raw.peerImportRowIds)
    ? raw.peerImportRowIds.filter((v): v is string => typeof v === "string")
    : [];
  return {
    version: 1,
    existingBookingIds,
    peerImportRowIds,
    nonBookingBlockers: Array.isArray(raw.nonBookingBlockers)
      ? (raw.nonBookingBlockers as ReservationImportConflictSnapshot["nonBookingBlockers"])
      : [],
    overlaps: Array.isArray(raw.overlaps)
      ? (raw.overlaps as ReservationImportConflictSnapshot["overlaps"])
      : [],
  };
}

/**
 * Deterministic connected components over undirected overlap edges.
 * Returns map nodeKey → groupId (stable: sorted component joined).
 */
export function assignConflictGroupIds(
  nodes: ReservationImportConflictNode[],
): Map<string, string> {
  const keyOf = (n: ReservationImportConflictNode) => `${n.kind}:${n.id}`;
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) {
    adj.set(keyOf(n), new Set());
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      if (a.unitId !== b.unitId) continue;
      const pa = StayPeriod.create(a.checkIn, a.checkOut);
      const pb = StayPeriod.create(b.checkIn, b.checkOut);
      if (!pa.overlaps(pb)) continue;
      adj.get(keyOf(a))!.add(keyOf(b));
      adj.get(keyOf(b))!.add(keyOf(a));
    }
  }

  const groupOf = new Map<string, string>();
  const visited = new Set<string>();
  for (const start of [...adj.keys()].sort()) {
    if (visited.has(start)) continue;
    const stack = [start];
    const component: string[] = [];
    visited.add(start);
    while (stack.length) {
      const cur = stack.pop()!;
      component.push(cur);
      for (const nxt of adj.get(cur) ?? []) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          stack.push(nxt);
        }
      }
    }
    // Only assign group ids to components with an edge (size>1) or keep singles ungrouped
    if (component.length < 2) continue;
    const groupId = component.slice().sort().join("|").slice(0, 64);
    for (const k of component) {
      groupOf.set(k, groupId);
    }
  }
  return groupOf;
}

export function nodeKey(
  kind: ReservationImportConflictNodeKind,
  id: string,
): string {
  return `${kind}:${id}`;
}

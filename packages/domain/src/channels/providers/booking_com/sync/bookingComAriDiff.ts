import { sha256HexUtf8 } from "../../../utils/sha256Hex";

export const BOOKING_COM_MAPPING_EVENTS = {
  VALIDATION: "booking_mapping_validation",
  CHANGED: "booking_mapping_changed",
  INITIAL_SYNC_PREVIEW: "booking_initial_sync_preview",
  INITIAL_SYNC_ENQUEUED: "booking_initial_sync_enqueued",
  RECONCILIATION_COMPLETED: "booking_reconciliation_completed",
  RECONCILIATION_DRIFT: "booking_reconciliation_drift",
  MAPPING_DRIFT: "booking_mapping_drift",
} as const;

export type BookingComMappingLogFn = (fields: Record<string, unknown>) => void;

export function emitBookingComMappingEvent(
  log: BookingComMappingLogFn,
  event: string,
  fields: Record<string, unknown>,
): void {
  log({
    event,
    provider: "booking_com",
    ...fields,
  });
}

/**
 * Deterministic ARI field-level diff for initial sync / reconciliation.
 * Values are already-resolved projections (no pricing engine here).
 */
export type BookingComAriFieldKind =
  | "roomstosell"
  | "closed"
  | "price"
  | "minstay"
  | "maxstay"
  | "cta"
  | "ctd";

export interface BookingComAriDiffCell {
  readonly hotelId: string;
  readonly roomTypeId: string;
  readonly ratePlanId: string | null;
  readonly date: string;
  readonly field: BookingComAriFieldKind;
  readonly local: string | number | boolean | null;
  readonly remote: string | number | boolean | null;
}

export interface BookingComAriDiffSummary {
  readonly dateHorizonFrom: string;
  readonly dateHorizonTo: string;
  readonly roomsAffected: number;
  readonly roomratesAffected: number;
  readonly availabilityChanges: number;
  readonly opens: number;
  readonly closes: number;
  readonly priceChanges: number;
  readonly minStayChanges: number;
  readonly maxStayChanges: number;
  readonly ctaChanges: number;
  readonly ctdChanges: number;
  readonly samples: readonly BookingComAriDiffCell[];
  readonly fingerprint: string;
}

export function diffBookingComAriState(input: {
  from: string;
  to: string;
  local: readonly BookingComAriDiffCell[];
  remote: readonly BookingComAriDiffCell[];
  sampleLimit?: number;
}): BookingComAriDiffSummary {
  const remoteByKey = new Map(
    input.remote.map((c) => [diffCellKey(c), c] as const),
  );
  const changes: BookingComAriDiffCell[] = [];

  for (const local of input.local) {
    const key = diffCellKey(local);
    const remote = remoteByKey.get(key);
    if (!remote || remote.remote !== local.local) {
      changes.push({
        ...local,
        remote: remote?.remote ?? null,
      });
    }
    remoteByKey.delete(key);
  }
  for (const orphan of remoteByKey.values()) {
    changes.push({
      ...orphan,
      local: null,
    });
  }

  changes.sort((a, b) => diffCellKey(a).localeCompare(diffCellKey(b)));

  const rooms = new Set(changes.map((c) => c.roomTypeId));
  const roomrates = new Set(
    changes
      .filter((c) => c.ratePlanId)
      .map((c) => `${c.roomTypeId}:${c.ratePlanId}`),
  );

  const count = (field: BookingComAriFieldKind) =>
    changes.filter((c) => c.field === field).length;

  const opens = changes.filter(
    (c) => c.field === "closed" && c.local === 0 && c.remote !== 0,
  ).length;
  const closes = changes.filter(
    (c) => c.field === "closed" && c.local === 1 && c.remote !== 1,
  ).length;

  const sampleLimit = input.sampleLimit ?? 20;
  const fingerprint = sha256HexUtf8(
    JSON.stringify({
      from: input.from,
      to: input.to,
      changes: changes.map((c) => ({
        k: diffCellKey(c),
        l: c.local,
        r: c.remote,
      })),
    }),
  );

  return {
    dateHorizonFrom: input.from,
    dateHorizonTo: input.to,
    roomsAffected: rooms.size,
    roomratesAffected: roomrates.size,
    availabilityChanges: count("roomstosell") + count("closed"),
    opens,
    closes,
    priceChanges: count("price"),
    minStayChanges: count("minstay"),
    maxStayChanges: count("maxstay"),
    ctaChanges: count("cta"),
    ctdChanges: count("ctd"),
    samples: changes.slice(0, sampleLimit),
    fingerprint,
  };
}

function diffCellKey(cell: BookingComAriDiffCell): string {
  return [
    cell.hotelId,
    cell.roomTypeId,
    cell.ratePlanId ?? "-",
    cell.date,
    cell.field,
  ].join("|");
}

export function buildInitialSyncConfirmationToken(input: {
  tenantId: string;
  connectionId: string;
  mappingConfigGeneration: number;
  talosStateFingerprint: string;
  remoteSnapshotFingerprint: string;
  diffFingerprint: string;
}): string {
  return sha256HexUtf8(
    [
      "bcom-initial-sync-v1",
      input.tenantId,
      input.connectionId,
      String(input.mappingConfigGeneration),
      input.talosStateFingerprint,
      input.remoteSnapshotFingerprint,
      input.diffFingerprint,
    ].join("\u0000"),
  );
}

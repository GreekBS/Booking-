import { BytesBuilder } from "../map/icalCanonicalEncoding";
import { sha256HexBytes } from "../../../utils/sha256Hex";

export const ICAL_INVENTORY_RECONCILE_OUTBOX_TAG = "ical-inventory-reconcile-outbox-v1";
export const ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE =
  "channel.ical.inventory.reconcile.requested.v1";
export const ICAL_INVENTORY_RECONCILE_AGGREGATE_TYPE = "ChannelInventoryReconciliation";

export interface IcalInventoryReconcileOutboxIdentity {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly cursorVersion: number;
  readonly semanticConfigVersion: number;
  readonly mappingId: string;
  readonly mappingVersion: number;
}

export function buildIcalInventoryReconcileDeliveryKey(
  identity: IcalInventoryReconcileOutboxIdentity,
): string {
  const builder = new BytesBuilder();
  builder.writeUtf8Tagged(ICAL_INVENTORY_RECONCILE_OUTBOX_TAG);
  builder.writeLengthPrefixedUtf8(identity.tenantId.trim());
  builder.writeLengthPrefixedUtf8(identity.connectionId.trim());
  builder.writeU32(identity.cursorVersion);
  builder.writeU32(identity.semanticConfigVersion);
  builder.writeLengthPrefixedUtf8(identity.mappingId.trim());
  builder.writeU32(identity.mappingVersion);
  return sha256HexBytes(builder.toUint8Array());
}

/** Deterministic UUID (version-5 style) from a 64-char lowercase hex SHA-256 digest. */
export function uuidFromSha256Hex(hex64: string): string {
  if (!/^[0-9a-f]{64}$/.test(hex64)) {
    throw new RangeError("expected 64 lowercase hex characters");
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Number.parseInt(hex64.slice(i * 2, i * 2 + 2), 16);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

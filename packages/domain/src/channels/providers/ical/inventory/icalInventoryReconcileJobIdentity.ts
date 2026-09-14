import { BytesBuilder } from "../map/icalCanonicalEncoding";
import { sha256HexBytes } from "../../../utils/sha256Hex";

export const ICAL_INVENTORY_RECONCILE_JOB_TAG = "ical-inventory-reconcile-job-v1";
export const ICAL_INVENTORY_RECONCILE_JOB_KEY_PREFIX = "riq:";

export interface IcalInventoryReconcileJobGenerationIdentity {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly cursorVersion: number;
}

function assertCursorVersion(cursorVersion: number): void {
  if (!Number.isInteger(cursorVersion) || cursorVersion < 1 || cursorVersion > 0xffffffff) {
    throw new RangeError("cursorVersion must be a u32 >= 1");
  }
}

function buildCanonical(
  identity: IcalInventoryReconcileJobGenerationIdentity,
  mode: "primary" | "after",
  previousTerminalJobId?: string,
): Uint8Array {
  assertCursorVersion(identity.cursorVersion);
  const builder = new BytesBuilder();
  builder.writeUtf8Tagged(ICAL_INVENTORY_RECONCILE_JOB_TAG);
  builder.writeLengthPrefixedUtf8(identity.tenantId.trim());
  builder.writeLengthPrefixedUtf8(identity.connectionId.trim());
  builder.writeU32(identity.cursorVersion);
  builder.writeLengthPrefixedUtf8(mode);
  if (mode === "after") {
    if (!previousTerminalJobId || previousTerminalJobId.trim().length === 0) {
      throw new RangeError("previousTerminalJobId is required for after mode");
    }
    builder.writeLengthPrefixedUtf8(previousTerminalJobId.trim());
  }
  return builder.toUint8Array();
}

export function buildIcalInventoryReconcilePrimaryJobKey(
  identity: IcalInventoryReconcileJobGenerationIdentity,
): string {
  return `${ICAL_INVENTORY_RECONCILE_JOB_KEY_PREFIX}${sha256HexBytes(
    buildCanonical(identity, "primary"),
  )}`;
}

export function buildIcalInventoryReconcileSuccessorJobKey(
  identity: IcalInventoryReconcileJobGenerationIdentity,
  previousTerminalJobId: string,
): string {
  return `${ICAL_INVENTORY_RECONCILE_JOB_KEY_PREFIX}${sha256HexBytes(
    buildCanonical(identity, "after", previousTerminalJobId),
  )}`;
}

export function isIcalInventoryReconcileJobKey(value: string): boolean {
  return /^riq:[0-9a-f]{64}$/.test(value);
}

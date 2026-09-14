import { decodeIcalIdentityKey } from "./icalIdentityCodec";
import type { IcalSnapshotEntry } from "./icalMapTypes";

/**
 * Deterministic provider-local event identity without delimiter ambiguity.
 * Uses S4a snapshot entry providerEventId when present; otherwise decodes identity key.
 */
export function resolveProviderEventId(
  identityKey: string,
  entryProviderEventId: string | null = null,
): string | null {
  if (entryProviderEventId !== null) {
    return entryProviderEventId;
  }
  const decoded = decodeIcalIdentityKey(identityKey);
  if (decoded === null) {
    return null;
  }
  return decoded.providerEventId;
}

export function providerEventIdFromEntry(entry: IcalSnapshotEntry): string | null {
  return resolveProviderEventId(entry.identityKey, entry.providerEventId);
}

export function providerEventIdFromIdentityKey(identityKey: string): string | null {
  return resolveProviderEventId(identityKey, null);
}

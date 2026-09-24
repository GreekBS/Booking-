/**
 * Pure selection helpers for Active Property Context (no React / storage).
 * Authorization always happens server-side — this only resolves UX selection.
 */

export const ACTIVE_PROPERTY_STORAGE_PREFIX = "talos:active-property";

export function activePropertyStorageKey(tenantId: string): string {
  return `${ACTIVE_PROPERTY_STORAGE_PREFIX}:${tenantId}`;
}

export function resolveActivePropertyId(
  accessibleIds: string[],
  storedId: string | null | undefined,
  currentId: string | null | undefined,
): string | null {
  if (accessibleIds.length === 0) return null;
  if (currentId && accessibleIds.includes(currentId)) return currentId;
  if (storedId && accessibleIds.includes(storedId)) return storedId;
  return accessibleIds[0]!;
}

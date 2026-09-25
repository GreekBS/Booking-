/**
 * Active Property 1.2 — canonical ChannelConnection property relevance.
 *
 * ChannelConnection remains tenant-scoped (may span multiple properties).
 * Relevance to property P is derived from authoritative mappings, with a
 * narrow workspace-affinity fallback for still-unmapped drafts/setups.
 *
 * Rule (connection C is relevant to property P):
 * 1. Any non-archived ChannelListingMapping on C with propertyId = P, OR
 * 2. Any non-archived ChannelProductMapping on C with propertyId = P, OR
 * 3. C.workspacePropertyId = P AND C has no property-bearing non-archived
 *    mappings yet (listing or product with propertyId set).
 *
 * Archived mappings do not keep a connection visible.
 * workspacePropertyId is NOT exclusive ownership and does not block
 * later multi-property mappings.
 */

export const CHANNEL_MAPPING_ARCHIVED_STATUS = "archived";

export interface ChannelPropertyBearingMappingRef {
  propertyId: string | null | undefined;
  status: string;
}

export function isActivePropertyBearingMapping(
  mapping: ChannelPropertyBearingMappingRef,
): boolean {
  if (mapping.status === CHANNEL_MAPPING_ARCHIVED_STATUS) {
    return false;
  }
  const propertyId = mapping.propertyId?.trim() ?? "";
  return propertyId.length > 0;
}

export function collectMappedPropertyIds(
  listingMappings: ReadonlyArray<ChannelPropertyBearingMappingRef>,
  productMappings: ReadonlyArray<ChannelPropertyBearingMappingRef>,
): string[] {
  const ids = new Set<string>();
  for (const mapping of listingMappings) {
    if (isActivePropertyBearingMapping(mapping) && mapping.propertyId) {
      ids.add(mapping.propertyId.trim());
    }
  }
  for (const mapping of productMappings) {
    if (isActivePropertyBearingMapping(mapping) && mapping.propertyId) {
      ids.add(mapping.propertyId.trim());
    }
  }
  return [...ids];
}

export function connectionHasPropertyBearingMappings(
  listingMappings: ReadonlyArray<ChannelPropertyBearingMappingRef>,
  productMappings: ReadonlyArray<ChannelPropertyBearingMappingRef>,
): boolean {
  return collectMappedPropertyIds(listingMappings, productMappings).length > 0;
}

/**
 * Resolve the set of properties that authorize access to a connection.
 * When mappings exist, those property ids are authoritative.
 * When unmapped, workspacePropertyId (if set) is the sole affinity.
 * When unmapped and no workspace affinity, returns [] (fail-closed for
 * property-restricted actors; tenant-wide admins may still access).
 */
export function resolveConnectionRelevantPropertyIds(input: {
  workspacePropertyId: string | null | undefined;
  listingMappings: ReadonlyArray<ChannelPropertyBearingMappingRef>;
  productMappings: ReadonlyArray<ChannelPropertyBearingMappingRef>;
}): string[] {
  const mapped = collectMappedPropertyIds(
    input.listingMappings,
    input.productMappings,
  );
  if (mapped.length > 0) {
    return mapped;
  }
  const workspace = input.workspacePropertyId?.trim() ?? "";
  return workspace.length > 0 ? [workspace] : [];
}

export function isConnectionRelevantToProperty(input: {
  propertyId: string;
  workspacePropertyId: string | null | undefined;
  listingMappings: ReadonlyArray<ChannelPropertyBearingMappingRef>;
  productMappings: ReadonlyArray<ChannelPropertyBearingMappingRef>;
}): boolean {
  const propertyId = input.propertyId.trim();
  if (propertyId.length === 0) {
    return false;
  }
  return resolveConnectionRelevantPropertyIds(input).includes(propertyId);
}

"use client";

/**
 * @deprecated Prefer `useActiveProperty` from `@/hooks/use-active-property`.
 * Thin compatibility wrapper that maps selectedPropertyId ↔ propertyId.
 */
import { useActiveProperty } from "@/hooks/use-active-property";

export function useSelectedProperty(
  _tenantId?: string | null,
  _propertyIds?: string[],
) {
  void _tenantId;
  void _propertyIds;
  const { propertyId, setActiveProperty, ready } = useActiveProperty();
  return {
    selectedPropertyId: propertyId,
    setSelectedPropertyId: setActiveProperty,
    ready,
  };
}

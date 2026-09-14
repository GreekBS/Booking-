"use client";

import { useMemo } from "react";
import type { PropertyRecord } from "@/lib/admin/types";
import type { RackPropertyGroup } from "../types";

export function buildRackGroup(
  properties: PropertyRecord[],
  selectedPropertyId: string | null,
  unitSearch: string,
): RackPropertyGroup | null {
  if (!selectedPropertyId) return null;

  const property = properties.find((p) => p.id === selectedPropertyId);
  if (!property) return null;

  const search = unitSearch.trim().toLowerCase();
  const units = property.units
    .filter((u) => !search || u.name.toLowerCase().includes(search))
    .map((u) => ({
      unitId: u.id,
      unitName: u.name,
      propertyId: property.id,
      propertyName: property.name,
    }));

  const catalogUnitIds = property.units.map((u) => u.id);

  return {
    propertyId: property.id,
    propertyName: property.name,
    units,
    catalogUnitIds,
  };
}

export function useRackGroup(
  properties: PropertyRecord[],
  selectedPropertyId: string | null,
  unitSearch: string,
) {
  return useMemo(
    () => buildRackGroup(properties, selectedPropertyId, unitSearch),
    [properties, selectedPropertyId, unitSearch],
  );
}

export function countCatalogUnits(properties: PropertyRecord[], selectedPropertyId: string | null) {
  if (!selectedPropertyId) return 0;
  const property = properties.find((p) => p.id === selectedPropertyId);
  return property?.units.length ?? 0;
}

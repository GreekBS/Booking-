/**
 * Lightweight property/unit catalog for selectors and filters.
 * Intentionally excludes amenities, location, policies, and other heavy fields.
 */
export interface PropertyUnitCatalogUnit {
  id: string;
  propertyId: string;
  name: string;
  status: string;
}

export interface PropertyUnitCatalogProperty {
  id: string;
  name: string;
  status: string;
  units: PropertyUnitCatalogUnit[];
}

export interface PropertyUnitCatalogResult {
  properties: PropertyUnitCatalogProperty[];
}

/**
 * Lightweight property/unit catalog for selectors and filters.
 * Intentionally excludes amenities, location, policies, and other heavy fields.
 * Includes Property.type so ops surfaces (e.g. Housekeeping) can branch without
 * a second catalog fetch.
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
  /** Persisted Property.type — source of truth for HK CleaningLocation mode. */
  type: string;
  units: PropertyUnitCatalogUnit[];
}

export interface PropertyUnitCatalogResult {
  properties: PropertyUnitCatalogProperty[];
}

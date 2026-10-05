import type { CsvImportUnitResolution } from "./types";

/**
 * Port for resolving CSV unit references (name / slug / id) within a property.
 * Implemented against catalog data — candidates must be property-scoped.
 */
export interface ICsvImportUnitResolver {
  /**
   * Resolve a unitRef among bookable units of the given property only.
   * Never inspects units belonging to other properties.
   */
  resolve(
    tenantId: string,
    propertyId: string,
    unitRef: string,
  ): Promise<CsvImportUnitResolution>;

  /** Bookable units for the active property (deletedAt null, status active). */
  listBookableUnits(
    tenantId: string,
    propertyId: string,
  ): Promise<CsvImportUnitCandidate[]>;
}

export interface CsvImportUnitCandidate {
  id: string;
  propertyId: string;
  name: string;
  slug: string | null;
  status?: string;
}

/**
 * Pure in-memory resolver for tests and adapters.
 * Matches trimmed unitRef against id (case-sensitive), or name/slug
 * case-insensitively after Unicode NFD diacritic strip.
 * Candidates are filtered to the requested propertyId.
 */
export function createInMemoryCsvImportUnitResolver(
  candidates: readonly CsvImportUnitCandidate[],
): ICsvImportUnitResolver {
  return {
    async listBookableUnits(
      _tenantId: string,
      propertyId: string,
    ): Promise<CsvImportUnitCandidate[]> {
      return candidates.filter(
        (c) =>
          c.propertyId === propertyId &&
          (c.status == null || c.status === "active"),
      );
    },

    async resolve(
      _tenantId: string,
      propertyId: string,
      unitRef: string,
    ): Promise<CsvImportUnitResolution> {
      const scoped = candidates.filter(
        (c) =>
          c.propertyId === propertyId &&
          (c.status == null || c.status === "active"),
      );
      const ref = unitRef.trim();
      if (!ref) return { status: "not_found" };

      const byId = scoped.filter((c) => c.id === ref);
      if (byId.length === 1) {
        return {
          status: "resolved",
          unitId: byId[0]!.id,
          propertyId: byId[0]!.propertyId,
        };
      }
      if (byId.length > 1) {
        return { status: "ambiguous", candidateIds: byId.map((c) => c.id) };
      }

      const needle = normalizeUnitKey(ref);
      const byNameOrSlug = scoped.filter(
        (c) =>
          normalizeUnitKey(c.name) === needle ||
          (c.slug != null && normalizeUnitKey(c.slug) === needle),
      );
      if (byNameOrSlug.length === 1) {
        return {
          status: "resolved",
          unitId: byNameOrSlug[0]!.id,
          propertyId: byNameOrSlug[0]!.propertyId,
        };
      }
      if (byNameOrSlug.length > 1) {
        return {
          status: "ambiguous",
          candidateIds: byNameOrSlug.map((c) => c.id),
        };
      }
      return { status: "not_found" };
    },
  };
}

function normalizeUnitKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "_");
}

/** Build a resolution map for a set of unit refs (property-scoped). */
export async function resolveCsvImportUnitRefs(
  resolver: ICsvImportUnitResolver,
  tenantId: string,
  propertyId: string,
  unitRefs: Iterable<string>,
): Promise<Map<string, CsvImportUnitResolution>> {
  const map = new Map<string, CsvImportUnitResolution>();
  for (const raw of unitRefs) {
    const key = raw.trim();
    if (!key || map.has(key)) continue;
    map.set(key, await resolver.resolve(tenantId, propertyId, key));
  }
  return map;
}

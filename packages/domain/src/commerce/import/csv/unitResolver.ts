import type { CsvImportUnitResolution } from "./types";

/**
 * Port for resolving CSV unit references (name / slug / id) without coupling
 * the pure CSV parser to Prisma. Implemented in B2 against catalog data.
 */
export interface ICsvImportUnitResolver {
  resolve(
    tenantId: string,
    unitRef: string,
  ): Promise<CsvImportUnitResolution>;
}

export interface CsvImportUnitCandidate {
  id: string;
  propertyId: string;
  name: string;
  slug: string;
}

/**
 * Pure in-memory resolver for tests and later adapters.
 * Matches trimmed unitRef against id (case-sensitive), or name/slug
 * case-insensitively after Unicode NFD diacritic strip.
 */
export function createInMemoryCsvImportUnitResolver(
  candidates: readonly CsvImportUnitCandidate[],
): ICsvImportUnitResolver {
  return {
    async resolve(
      _tenantId: string,
      unitRef: string,
    ): Promise<CsvImportUnitResolution> {
      const ref = unitRef.trim();
      if (!ref) return { status: "not_found" };

      const byId = candidates.filter((c) => c.id === ref);
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
      const byNameOrSlug = candidates.filter(
        (c) =>
          normalizeUnitKey(c.name) === needle ||
          normalizeUnitKey(c.slug) === needle,
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

/** Build a resolution map for a set of unit refs (B1 helper / tests). */
export async function resolveCsvImportUnitRefs(
  resolver: ICsvImportUnitResolver,
  tenantId: string,
  unitRefs: Iterable<string>,
): Promise<Map<string, CsvImportUnitResolution>> {
  const map = new Map<string, CsvImportUnitResolution>();
  for (const raw of unitRefs) {
    const key = raw.trim();
    if (!key || map.has(key)) continue;
    map.set(key, await resolver.resolve(tenantId, key));
  }
  return map;
}

import { lookupCanonicalFieldAlias } from "./aliases";
import { normalizeCsvHeader } from "./normalizeHeader";
import {
  CSV_IMPORT_REQUIRED_FIELDS,
  type CsvImportCanonicalField,
  type CsvImportHeaderMappingResult,
  type CsvImportIssue,
} from "./types";

function issue(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): CsvImportIssue {
  return {
    code,
    severity: "error",
    message,
    rowNumber: null,
    details,
  };
}

/**
 * Build header mapping from CSV headers with optional operator overrides.
 * Explicit `columnMapping` keys match original header text (case-sensitive as in file)
 * OR normalized form — we match both for convenience.
 */
export function mapCsvImportHeaders(
  headers: string[],
  columnMapping?: Record<string, CsvImportCanonicalField | null>,
  requiredFields: readonly CsvImportCanonicalField[] = CSV_IMPORT_REQUIRED_FIELDS,
): CsvImportHeaderMappingResult {
  const issues: CsvImportIssue[] = [];
  const normalizedHeaders = headers.map(normalizeCsvHeader);
  const mapping: Record<string, CsvImportCanonicalField | null> = {};
  const autoMapped: Record<string, CsvImportCanonicalField> = {};

  // Detect empty / duplicate normalized headers
  const seenNormalized = new Map<string, number>();
  for (let i = 0; i < headers.length; i++) {
    const original = headers[i]!;
    const normalized = normalizedHeaders[i]!;
    if (!original.trim() || !normalized) {
      issues.push(
        issue("CSV_EMPTY_HEADER", `Header at column ${i + 1} is empty`, {
          columnIndex: i,
        }),
      );
      mapping[original] = null;
      continue;
    }
    const prev = seenNormalized.get(normalized);
    if (prev !== undefined) {
      issues.push(
        issue(
          "CSV_DUPLICATE_HEADER",
          `Duplicate header "${original}" (same as column ${prev + 1} after normalization)`,
          { columnIndex: i, otherColumnIndex: prev, normalized },
        ),
      );
    } else {
      seenNormalized.set(normalized, i);
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const original = headers[i]!;
    const normalized = normalizedHeaders[i]!;
    if (!normalized) continue;

    const override = resolveOverride(original, normalized, columnMapping);
    if (override !== undefined) {
      mapping[original] = override;
      continue;
    }

    const auto = lookupCanonicalFieldAlias(original);
    if (auto) {
      mapping[original] = auto;
      autoMapped[original] = auto;
    } else {
      mapping[original] = null;
    }
  }

  // Ambiguity: same canonical field claimed by >1 columns (non-null)
  const fieldOwners = new Map<CsvImportCanonicalField, string[]>();
  for (const [header, field] of Object.entries(mapping)) {
    if (!field) continue;
    const list = fieldOwners.get(field) ?? [];
    list.push(header);
    fieldOwners.set(field, list);
  }

  const ambiguousFields: CsvImportCanonicalField[] = [];
  for (const [field, owners] of fieldOwners) {
    if (owners.length > 1) {
      ambiguousFields.push(field);
      issues.push(
        issue(
          "CSV_AMBIGUOUS_MAPPING",
          `Canonical field "${field}" maps to multiple columns: ${owners.join(", ")}`,
          { field, headers: owners },
        ),
      );
      // Clear ambiguous mappings so rows do not silently pick one
      for (const h of owners) {
        mapping[h] = null;
        delete autoMapped[h];
      }
    }
  }

  const mappedFields = new Set(
    Object.values(mapping).filter((v): v is CsvImportCanonicalField => v != null),
  );
  const missingRequiredFields = requiredFields.filter(
    (f) => !mappedFields.has(f),
  );
  for (const field of missingRequiredFields) {
    issues.push(
      issue(
        "CSV_MISSING_REQUIRED_MAPPING",
        `Required column for "${field}" is not mapped`,
        { field },
      ),
    );
  }

  const unmappedHeaders = headers.filter((h) => mapping[h] == null && h.trim());

  return {
    headers,
    normalizedHeaders,
    mapping,
    autoMapped,
    unmappedHeaders,
    ambiguousFields,
    missingRequiredFields: [...missingRequiredFields],
    issues,
  };
}

function resolveOverride(
  original: string,
  normalized: string,
  columnMapping?: Record<string, CsvImportCanonicalField | null>,
): CsvImportCanonicalField | null | undefined {
  if (!columnMapping) return undefined;
  if (Object.prototype.hasOwnProperty.call(columnMapping, original)) {
    return columnMapping[original]!;
  }
  // Allow override keyed by normalized header
  for (const [key, value] of Object.entries(columnMapping)) {
    if (normalizeCsvHeader(key) === normalized) {
      return value;
    }
  }
  return undefined;
}

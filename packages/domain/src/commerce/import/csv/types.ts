import type { ImportStayTemporalClass } from "../ImportStayTemporalClass";
import type { CsvImportDateFormat, CsvImportDelimiter } from "./constants";

/** Canonical columns recognized by the CSV reservation import mapper. */
export type CsvImportCanonicalField =
  | "externalReference"
  | "unitRef"
  | "guestName"
  | "guestEmail"
  | "guestPhone"
  | "checkIn"
  | "checkOut"
  | "guestCount"
  | "totalAmount"
  | "currency"
  | "channelSource"
  | "notes";

/**
 * Always-required CSV columns (header mapping + cell presence).
 * `unitRef` is conditionally required for multi-unit properties (enforced in B2
 * with active property scope). `guestEmail` is optional end-to-end.
 */
export const CSV_IMPORT_REQUIRED_FIELDS: readonly CsvImportCanonicalField[] = [
  "externalReference",
  "guestName",
  "checkIn",
  "checkOut",
  "guestCount",
] as const;

export const CSV_IMPORT_OPTIONAL_FIELDS: readonly CsvImportCanonicalField[] = [
  "unitRef",
  "guestEmail",
  "guestPhone",
  "totalAmount",
  "currency",
  "channelSource",
  "notes",
] as const;

/** Effective required fields for mapping UX given bookable unit count on the active property. */
export function csvImportRequiredFieldsForProperty(bookableUnitCount: number): readonly CsvImportCanonicalField[] {
  if (bookableUnitCount >= 2) {
    return [...CSV_IMPORT_REQUIRED_FIELDS, "unitRef"] as const;
  }
  return CSV_IMPORT_REQUIRED_FIELDS;
}

export type CsvImportIssueSeverity = "error" | "warning";

export interface CsvImportIssue {
  code: string;
  severity: CsvImportIssueSeverity;
  message: string;
  /** 1-based CSV data row number (excludes header). Null for file-level issues. */
  rowNumber: number | null;
  field?: CsvImportCanonicalField | null;
  details?: Record<string, unknown>;
}

export type CsvImportPriceState =
  | { status: "missing" }
  | { status: "invalid"; raw: string; reason: string }
  | {
      status: "present";
      amount: string;
      currency: string | null;
      /** Suitable for later `imported_csv` fixed-total Quote path. */
      readyForImportedCsvQuote: boolean;
    };

export interface CsvImportCanonicalRow {
  rowNumber: number;
  externalReference: string | null;
  unitRef: string | null;
  unitId: string | null;
  propertyId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  checkIn: string | null;
  checkOut: string | null;
  guestCount: number | null;
  totalAmount: string | null;
  currency: string | null;
  channelSource: string | null;
  notes: string | null;
  price: CsvImportPriceState;
  temporalClass: ImportStayTemporalClass | null;
  /** Raw cells keyed by original header text. */
  raw: Record<string, string>;
  errors: CsvImportIssue[];
  warnings: CsvImportIssue[];
  /** True when structurally importable (required fields + unit resolved). */
  structurallyImportable: boolean;
}

export interface CsvImportHeaderMappingResult {
  /** Original header texts in file order. */
  headers: string[];
  /** Normalized header texts in file order. */
  normalizedHeaders: string[];
  /** Auto or effective mapping: original header → canonical field (or null if ignored). */
  mapping: Record<string, CsvImportCanonicalField | null>;
  autoMapped: Record<string, CsvImportCanonicalField>;
  unmappedHeaders: string[];
  /** Canonical fields claimed by more than one column. */
  ambiguousFields: CsvImportCanonicalField[];
  /** Required canonical fields with no mapped column. */
  missingRequiredFields: CsvImportCanonicalField[];
  issues: CsvImportIssue[];
}

export interface CsvImportParseOptions {
  /** Explicit delimiter; otherwise detected. */
  delimiter?: CsvImportDelimiter;
  /**
   * Date interpretation for ambiguous numeric dates (DD/MM vs MM/DD).
   * ISO `YYYY-MM-DD` is always accepted when present.
   */
  dateFormat?: CsvImportDateFormat;
  /**
   * Operator override: original header → canonical field, or `null` to ignore a column.
   * Overrides auto-mapping for listed headers only.
   */
  columnMapping?: Record<string, CsvImportCanonicalField | null>;
  /** Property-local today (YYYY-MM-DD) for temporal classification. */
  propertyLocalToday?: string;
  /**
   * Precomputed unit resolutions keyed by trimmed unitRef.
   * When omitted, unitId stays null and UNIT_UNRESOLVED is not emitted
   * (resolution is a B2 concern).
   */
  unitResolutions?: ReadonlyMap<string, CsvImportUnitResolution>;
  /**
   * When the active property has exactly one bookable unit, apply this
   * resolution to rows with empty unitRef.
   */
  defaultUnitResolution?: Extract<CsvImportUnitResolution, { status: "resolved" }> | null;
  /**
   * Bookable unit count on the active property. When >= 2 and unitResolutions
   * are provided, empty unitRef fails closed.
   */
  bookableUnitCount?: number;
}

export type CsvImportUnitResolution =
  | { status: "resolved"; unitId: string; propertyId: string }
  | { status: "not_found" }
  | { status: "ambiguous"; candidateIds: string[] };

export interface CsvImportFileParseResult {
  ok: boolean;
  delimiter: CsvImportDelimiter | null;
  headers: string[];
  /** Data rows as parallel string arrays (same length as headers when rectangular). */
  records: string[][];
  byteLength: number;
  issues: CsvImportIssue[];
}

export interface CsvImportParseResult {
  ok: boolean;
  delimiter: CsvImportDelimiter | null;
  headerMapping: CsvImportHeaderMappingResult | null;
  dateFormat: CsvImportDateFormat | null;
  rows: CsvImportCanonicalRow[];
  issues: CsvImportIssue[];
  rowCount: number;
  structurallyImportableCount: number;
}

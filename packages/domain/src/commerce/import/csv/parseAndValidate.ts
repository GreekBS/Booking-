import type { CsvImportDateFormat, CsvImportDelimiter } from "./constants";
import { mapCsvImportHeaders } from "./mapHeaders";
import { parseCsvImportFile } from "./parseCsvFile";
import {
  csvImportRequiredFieldsForProperty,
  type CsvImportCanonicalField,
  type CsvImportCanonicalRow,
  type CsvImportHeaderMappingResult,
  type CsvImportIssue,
  type CsvImportParseOptions,
  type CsvImportParseResult,
} from "./types";
import { validateCsvImportRow } from "./validateRow";

export interface ParseAndValidateCsvImportInput extends CsvImportParseOptions {
  content: Uint8Array | string;
}

/**
 * Full B1 pipeline: file parse → header map → per-row validation.
 * Pure (no I/O). Unit resolution applied only when `unitResolutions` provided.
 */
export function parseAndValidateCsvImport(
  input: ParseAndValidateCsvImportInput,
): CsvImportParseResult {
  const file = parseCsvImportFile(input.content, {
    delimiter: input.delimiter,
  });

  const fileIssues = [...file.issues];
  if (!file.ok && file.records.length === 0) {
    return {
      ok: false,
      delimiter: file.delimiter,
      headerMapping: null,
      dateFormat: input.dateFormat ?? null,
      rows: [],
      issues: fileIssues,
      rowCount: 0,
      structurallyImportableCount: 0,
    };
  }

  const headerMapping = mapCsvImportHeaders(
    file.headers,
    input.columnMapping,
    input.bookableUnitCount != null
      ? csvImportRequiredFieldsForProperty(input.bookableUnitCount)
      : undefined,
  );
  const issues: CsvImportIssue[] = [...fileIssues, ...headerMapping.issues];

  // If mapping has blocking ambiguity / empty headers / duplicates — still parse
  // rows for diagnostics, but ok=false.
  const mappingBlocking = headerMapping.issues.some((i) => i.severity === "error");

  const rows: CsvImportCanonicalRow[] = [];
  for (let i = 0; i < file.records.length; i++) {
    const record = file.records[i]!;
    const raw: Record<string, string> = {};
    const values: Partial<Record<CsvImportCanonicalField, string>> = {};

    for (let c = 0; c < file.headers.length; c++) {
      const header = file.headers[c]!;
      const cell = record[c] ?? "";
      raw[header] = cell;
      const field = headerMapping.mapping[header];
      if (field) {
        // First mapped wins; ambiguity already cleared in mapHeaders
        if (values[field] == null) {
          values[field] = cell;
        }
      }
    }

    const unitRef = values.unitRef?.trim() ?? "";
    const unitResolution =
      unitRef && input.unitResolutions
        ? input.unitResolutions.get(unitRef) ?? null
        : null;
    const requireUnitResolution = Boolean(input.unitResolutions);
    const defaultUnitResolution =
      !unitRef && input.defaultUnitResolution
        ? input.defaultUnitResolution
        : null;

    const row = validateCsvImportRow({
      rowNumber: i + 1,
      values,
      raw,
      dateFormat: input.dateFormat,
      propertyLocalToday: input.propertyLocalToday,
      unitResolution,
      defaultUnitResolution,
      requireUnitResolution,
    });
    rows.push(row);
    issues.push(...row.errors, ...row.warnings);
  }

  const structurallyImportableCount = rows.filter(
    (r) => r.structurallyImportable,
  ).length;
  const hasBlocking =
    issues.some((i) => i.severity === "error") || mappingBlocking || !file.ok;

  return {
    ok: !hasBlocking,
    delimiter: file.delimiter,
    headerMapping,
    dateFormat: input.dateFormat ?? null,
    rows,
    issues,
    rowCount: rows.length,
    structurallyImportableCount,
  };
}

/** Inspect headers + suggested mapping without full row validation. */
export function inspectCsvImport(
  content: Uint8Array | string,
  options: {
    delimiter?: CsvImportDelimiter;
    columnMapping?: CsvImportParseOptions["columnMapping"];
    bookableUnitCount?: number;
  } = {},
): {
  ok: boolean;
  delimiter: CsvImportDelimiter | null;
  headerMapping: CsvImportHeaderMappingResult | null;
  sampleRows: Record<string, string>[];
  issues: CsvImportIssue[];
  byteLength: number;
  dataRowCount: number;
} {
  const file = parseCsvImportFile(content, { delimiter: options.delimiter });
  if (file.headers.length === 0) {
    return {
      ok: false,
      delimiter: file.delimiter,
      headerMapping: null,
      sampleRows: [],
      issues: file.issues,
      byteLength: file.byteLength,
      dataRowCount: 0,
    };
  }

  const headerMapping = mapCsvImportHeaders(
    file.headers,
    options.columnMapping,
    options.bookableUnitCount != null
      ? csvImportRequiredFieldsForProperty(options.bookableUnitCount)
      : undefined,
  );
  const sampleRows = file.records.slice(0, 5).map((record) => {
    const raw: Record<string, string> = {};
    for (let c = 0; c < file.headers.length; c++) {
      raw[file.headers[c]!] = record[c] ?? "";
    }
    return raw;
  });

  const issues = [...file.issues, ...headerMapping.issues];
  return {
    ok: !issues.some((i) => i.severity === "error"),
    delimiter: file.delimiter,
    headerMapping,
    sampleRows,
    issues,
    byteLength: file.byteLength,
    dataRowCount: file.records.length,
  };
}

export type { CsvImportDateFormat };

import { parse } from "csv-parse/sync";
import {
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_MAX_DATA_ROWS,
  CSV_IMPORT_MAX_FIELD_CHARS,
  CSV_IMPORT_MAX_HEADER_CHARS,
  type CsvImportDelimiter,
} from "./constants";
import { detectCsvDelimiter } from "./detectDelimiter";
import type { CsvImportFileParseResult, CsvImportIssue } from "./types";

function fileIssue(
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

export interface ParseCsvFileOptions {
  delimiter?: CsvImportDelimiter;
}

/**
 * Decode UTF-8 (reject invalid), strip BOM, detect delimiter, parse RFC4180 CSV.
 * Does not map/validate business fields — structural file parse only.
 */
export function parseCsvImportFile(
  input: Uint8Array | string,
  options: ParseCsvFileOptions = {},
): CsvImportFileParseResult {
  const issues: CsvImportIssue[] = [];
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  const byteLength = bytes.byteLength;

  if (byteLength === 0) {
    return {
      ok: false,
      delimiter: null,
      headers: [],
      records: [],
      byteLength,
      issues: [fileIssue("CSV_EMPTY_FILE", "CSV file is empty")],
    };
  }

  if (byteLength > CSV_IMPORT_MAX_BYTES) {
    return {
      ok: false,
      delimiter: null,
      headers: [],
      records: [],
      byteLength,
      issues: [
        fileIssue(
          "CSV_FILE_TOO_LARGE",
          `CSV exceeds the ${CSV_IMPORT_MAX_BYTES} byte limit`,
          { byteLength, maxBytes: CSV_IMPORT_MAX_BYTES },
        ),
      ],
    };
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return {
      ok: false,
      delimiter: null,
      headers: [],
      records: [],
      byteLength,
      issues: [
        fileIssue(
          "CSV_INVALID_ENCODING",
          "CSV must be valid UTF-8 text",
        ),
      ],
    };
  }

  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  if (!text.trim()) {
    return {
      ok: false,
      delimiter: null,
      headers: [],
      records: [],
      byteLength,
      issues: [fileIssue("CSV_EMPTY_FILE", "CSV file is empty")],
    };
  }

  const delimiter = options.delimiter ?? detectCsvDelimiter(text);

  let matrix: string[][];
  try {
    matrix = parse(text, {
      delimiter,
      bom: false,
      relax_column_count: true,
      skip_empty_lines: false,
      relax_quotes: false,
      trim: false,
    }) as string[][];
  } catch (error) {
    return {
      ok: false,
      delimiter,
      headers: [],
      records: [],
      byteLength,
      issues: [
        fileIssue(
          "CSV_MALFORMED",
          error instanceof Error ? error.message : "Malformed CSV",
        ),
      ],
    };
  }

  // Drop trailing fully-empty rows often produced by final newline
  while (
    matrix.length > 0 &&
    matrix[matrix.length - 1]!.every((c) => c.trim() === "")
  ) {
    matrix.pop();
  }

  if (matrix.length === 0) {
    return {
      ok: false,
      delimiter,
      headers: [],
      records: [],
      byteLength,
      issues: [fileIssue("CSV_EMPTY_FILE", "CSV file is empty")],
    };
  }

  const headerRow = matrix[0]!.map((h) => String(h ?? ""));
  for (let i = 0; i < headerRow.length; i++) {
    const h = headerRow[i]!;
    if (h.length > CSV_IMPORT_MAX_HEADER_CHARS) {
      issues.push(
        fileIssue(
          "CSV_HEADER_TOO_LONG",
          `Header at column ${i + 1} exceeds ${CSV_IMPORT_MAX_HEADER_CHARS} characters`,
          { columnIndex: i, length: h.length },
        ),
      );
    }
  }

  const dataRows = matrix.slice(1);
  if (dataRows.length > CSV_IMPORT_MAX_DATA_ROWS) {
    return {
      ok: false,
      delimiter,
      headers: headerRow,
      records: [],
      byteLength,
      issues: [
        ...issues,
        fileIssue(
          "CSV_TOO_MANY_ROWS",
          `CSV has ${dataRows.length} data rows; maximum is ${CSV_IMPORT_MAX_DATA_ROWS}`,
          {
            rowCount: dataRows.length,
            maxRows: CSV_IMPORT_MAX_DATA_ROWS,
          },
        ),
      ],
    };
  }

  const records: string[][] = [];
  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r]!.map((c) => String(c ?? ""));
    // Pad / trim to header width for stable column access
    const normalized: string[] = [];
    for (let c = 0; c < headerRow.length; c++) {
      const cell = row[c] ?? "";
      if (cell.length > CSV_IMPORT_MAX_FIELD_CHARS) {
        issues.push({
          code: "CSV_FIELD_TOO_LONG",
          severity: "error",
          message: `Field exceeds ${CSV_IMPORT_MAX_FIELD_CHARS} characters`,
          rowNumber: r + 1,
          details: { columnIndex: c, length: cell.length },
        });
      }
      normalized.push(cell);
    }
    // Extra columns beyond headers → file error
    if (row.length > headerRow.length) {
      issues.push({
        code: "CSV_EXTRA_COLUMNS",
        severity: "error",
        message: `Row ${r + 1} has more columns than the header`,
        rowNumber: r + 1,
        details: { columnCount: row.length, headerCount: headerRow.length },
      });
    }
    records.push(normalized);
  }

  // Header-only file is allowed structurally (0 rows) but flagged
  if (records.length === 0) {
    issues.push(
      fileIssue("CSV_NO_DATA_ROWS", "CSV has a header but no data rows"),
    );
  }

  const hasBlocking = issues.some((i) => i.severity === "error");

  return {
    ok: !hasBlocking && records.length > 0,
    delimiter,
    headers: headerRow,
    records,
    byteLength,
    issues,
  };
}

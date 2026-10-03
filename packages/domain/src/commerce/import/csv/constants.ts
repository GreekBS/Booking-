/** Safety limits for CSV reservation import (Phase B1). */
export const CSV_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_IMPORT_MAX_DATA_ROWS = 500;
export const CSV_IMPORT_MAX_FIELD_CHARS = 2_000;
export const CSV_IMPORT_MAX_HEADER_CHARS = 200;

export type CsvImportDelimiter = "," | ";" | "\t";

export const CSV_IMPORT_DELIMITERS: readonly CsvImportDelimiter[] = [
  ",",
  ";",
  "\t",
] as const;

export type CsvImportDateFormat = "iso" | "dmy" | "mdy";

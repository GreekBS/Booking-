import { LocalDate } from "../../shared/value-objects/LocalDate";
import type { CsvImportDateFormat } from "./constants";

export type ParseCsvImportDateResult =
  | { ok: true; iso: string }
  | { ok: false; code: string; message: string };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** ISO calendar date prefix with optional discarded time-of-day text (no TZ conversion). */
const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})(?:\s+.+)?$/;
const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/**
 * Parse a CSV date cell into ISO `YYYY-MM-DD` using LocalDate validation.
 * Unambiguous ISO is always accepted.
 * ISO date followed by time text (e.g. `2026-11-06 03:00 PM`) normalizes to the stay date only.
 * Ambiguous numeric dates require an explicit `dateFormat` of `dmy` or `mdy`.
 * Never performs timezone conversion.
 */
export function parseCsvImportDate(
  raw: string,
  dateFormat: CsvImportDateFormat | undefined,
): ParseCsvImportDateResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: "DATE_MISSING",
      message: "Date is required",
    };
  }

  const isoMatch = ISO_DATE.exec(trimmed);
  if (isoMatch) {
    return toLocalDateResult(trimmed);
  }

  const isoPrefix = ISO_DATE_PREFIX.exec(trimmed);
  if (isoPrefix) {
    return toLocalDateResult(isoPrefix[1]!);
  }

  const numeric = NUMERIC_DATE.exec(trimmed);
  if (!numeric) {
    return {
      ok: false,
      code: "DATE_UNRECOGNIZED",
      message: `Unrecognized date value: ${trimmed}`,
    };
  }

  const a = Number(numeric[1]);
  const b = Number(numeric[2]);
  const year = Number(numeric[3]);

  if (!dateFormat || dateFormat === "iso") {
    // Ambiguous without dmy/mdy — never guess
    return {
      ok: false,
      code: "DATE_FORMAT_REQUIRED",
      message: `Ambiguous date "${trimmed}" requires an explicit date format (dmy or mdy)`,
    };
  }

  let day: number;
  let month: number;
  if (dateFormat === "dmy") {
    day = a;
    month = b;
  } else {
    month = a;
    day = b;
  }

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return toLocalDateResult(iso);
}

function toLocalDateResult(iso: string): ParseCsvImportDateResult {
  try {
    const date = LocalDate.create(iso);
    return { ok: true, iso: date.value };
  } catch {
    return {
      ok: false,
      code: "DATE_INVALID",
      message: `Invalid calendar date: ${iso}`,
    };
  }
}

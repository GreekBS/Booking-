/**
 * Operator-facing money + date presentation helpers.
 * Do not change Money storage / 4dp arithmetic — display only.
 * Do not change ISO API / storage date semantics — display only.
 */

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/admin/utils";
import {
  collectionSourceLabelEl,
  fiscalDocumentKindLabelEl,
  paymentMethodLabelEl,
  paymentStatusLabelEl,
} from "@/lib/i18n";

/** Compact currency for ledgers and forms (operator-friendly decimals). */
export function formatOperatorMoney(amount: string, currency: string): string {
  return formatMoney(amount, currency);
}

/** Right-aligned tabular money cell class for ledger tables. */
export function moneyCellClassName(className?: string): string {
  return cn("text-right tabular-nums font-medium", className);
}

/**
 * Extract YYYY-MM-DD from a date-only string or ISO datetime prefix.
 * Does not use Date parsing for date-only values (avoids timezone day shift).
 */
export function extractOperatorDateOnly(
  isoOrDateOnly: string | null | undefined,
): string | null {
  if (isoOrDateOnly == null) return null;
  const trimmed = String(isoOrDateOnly).trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * Human-readable date-only display for the authenticated Talos operator UI.
 * Always `DD/MM/YYYY` with leading zeros. Safe for property-local date-only values.
 */
export function formatOperatorDateOnly(
  isoOrDateOnly: string | null | undefined,
): string {
  const ymd = extractOperatorDateOnly(isoOrDateOnly);
  if (!ymd) return isoOrDateOnly?.trim() ? String(isoOrDateOnly) : "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/** Stay range: `DD/MM/YYYY → DD/MM/YYYY`. */
export function formatOperatorStayRange(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined,
): string {
  return `${formatOperatorDateOnly(checkIn)} → ${formatOperatorDateOnly(checkOut)}`;
}

/**
 * Compact date/time for payment ledgers and timestamps.
 * Date part is DD/MM/YYYY; time uses local 2-digit hour/minute.
 */
export function formatOperatorDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
  } catch {
    return iso;
  }
}

/**
 * Compact date for fiscal / operator ledgers — DD/MM/YYYY.
 * Accepts date-only or ISO datetime strings.
 */
export function formatOperatorDate(iso: string | null): string {
  if (!iso) return "—";
  const asDateOnly = extractOperatorDateOnly(iso);
  if (asDateOnly && /^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) {
    return formatOperatorDateOnly(asDateOnly);
  }
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return formatOperatorDateOnly(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return formatOperatorDateOnly(iso);
  }
}

export function paymentMethodLabel(method: string): string {
  return paymentMethodLabelEl(method);
}

export function collectionSourceLabel(source: string): string {
  return collectionSourceLabelEl(source);
}

export function paymentStatusLabel(status: string): string {
  return paymentStatusLabelEl(status);
}

export function fiscalDocumentKindLabel(kind: string): string {
  return fiscalDocumentKindLabelEl(kind);
}

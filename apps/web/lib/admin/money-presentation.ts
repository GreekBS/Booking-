/**
 * Operator-facing money presentation helpers.
 * Do not change Money storage / 4dp arithmetic — display only.
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

/** Compact date/time for payment ledgers. */
export function formatOperatorDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("el-GR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Compact date for fiscal ledgers. */
export function formatOperatorDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("el-GR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
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

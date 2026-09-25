/**
 * Operator-facing money presentation helpers.
 * Do not change Money storage / 4dp arithmetic — display only.
 */

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/admin/utils";

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
    return new Date(iso).toLocaleString(undefined, {
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
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  OTA: "OTA",
  OTHER: "Other",
};

const COLLECTION_SOURCE_LABELS: Record<string, string> = {
  DIRECT: "Direct",
  PROPERTY: "Property",
  OTA: "OTA",
  PAYMENT_GATEWAY: "Payment gateway",
  OTHER: "Other",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

const FISCAL_KIND_LABELS: Record<string, string> = {
  SERVICE_INVOICE: "Service invoice",
  SERVICE_RECEIPT: "Service receipt",
  SERVICE_CREDIT: "Service credit",
  RETAIL_CREDIT: "Retail credit",
  CLIMATE_RESILIENCE_FEE_RECEIPT: "Climate Resilience Fee receipt",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method.replace(/_/g, " ");
}

export function collectionSourceLabel(source: string): string {
  return COLLECTION_SOURCE_LABELS[source] ?? source.replace(/_/g, " ");
}

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function fiscalDocumentKindLabel(kind: string): string {
  return FISCAL_KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

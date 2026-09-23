import { ValidationError } from "../../shared/errors/DomainError";

/**
 * Provider-neutral fiscal document kinds.
 * Greek myDATA codes belong in GreekFiscalDocumentMapper — not here.
 */
export type FiscalDocumentKind =
  | "SERVICE_INVOICE"
  | "SERVICE_RECEIPT"
  | "SERVICE_CREDIT"
  | "RETAIL_CREDIT"
  | "CLIMATE_RESILIENCE_FEE_RECEIPT";

export const FISCAL_DOCUMENT_KINDS: readonly FiscalDocumentKind[] = [
  "SERVICE_INVOICE",
  "SERVICE_RECEIPT",
  "SERVICE_CREDIT",
  "RETAIL_CREDIT",
  "CLIMATE_RESILIENCE_FEE_RECEIPT",
] as const;

export function isCreditDocumentKind(kind: FiscalDocumentKind): boolean {
  return kind === "SERVICE_CREDIT" || kind === "RETAIL_CREDIT";
}

export function isClimateFeeDocumentKind(kind: FiscalDocumentKind): boolean {
  return kind === "CLIMATE_RESILIENCE_FEE_RECEIPT";
}

/** Series may only issue documents of their configured kind. */
export function assertSeriesKindCompatible(
  seriesKind: FiscalDocumentKind,
  documentKind: FiscalDocumentKind,
): void {
  if (seriesKind !== documentKind) {
    throw new ValidationError(
      `FiscalSeries kind ${seriesKind} incompatible with document kind ${documentKind}`,
    );
  }
}

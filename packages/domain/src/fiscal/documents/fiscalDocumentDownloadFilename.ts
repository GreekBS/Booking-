/**
 * Deterministic, human-readable download filenames from FiscalDocument identity.
 * Uses series + sequential number when issued; falls back to draft id fragment.
 */

const KIND_FILE_PREFIX: Record<string, string> = {
  SERVICE_INVOICE: "invoice",
  SERVICE_RECEIPT: "receipt",
  SERVICE_CREDIT: "credit",
  RETAIL_CREDIT: "retail-credit",
  CLIMATE_RESILIENCE_FEE_RECEIPT: "climate-fee-receipt",
};

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function fiscalDocumentKindFilePrefix(documentKind: string): string {
  const mapped = KIND_FILE_PREFIX[documentKind];
  if (mapped) return mapped;
  const sanitized = sanitizeSegment(documentKind).toLowerCase();
  return sanitized.length > 0 ? sanitized : "fiscal";
}

export function buildFiscalDocumentDownloadFilename(input: {
  documentKind: string;
  seriesCode: string | null | undefined;
  sequentialNumber: number | null | undefined;
  documentId: string;
  extension: "pdf" | "html";
}): string {
  const prefix = fiscalDocumentKindFilePrefix(input.documentKind);
  const series = sanitizeSegment(input.seriesCode ?? "");
  const seq =
    input.sequentialNumber != null && Number.isFinite(input.sequentialNumber)
      ? String(Math.trunc(input.sequentialNumber)).padStart(6, "0")
      : null;

  if (series && seq) {
    return `${prefix}-${series}-${seq}.${input.extension}`;
  }

  const idFrag = sanitizeSegment(input.documentId).slice(0, 8) || "draft";
  return `${prefix}-draft-${idFrag}.${input.extension}`;
}

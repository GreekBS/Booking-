import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../../commerce/shared/value-objects/Money";
import type { Folio, FolioLine, FolioLineSourceType } from "../domain/Folio";

/** Provenance source type for future BFS-3b commercial adjustment lines. */
export const BOOKING_COMMERCIAL_AMENDMENT_SOURCE_TYPE =
  "booking_commercial_amendment" as const satisfies FolioLineSourceType;

export const COMMERCIAL_AMENDMENT_FOLIO_CLOSED_MESSAGE =
  "Commercial amendment rejected: primary folio is closed";

export const COMMERCIAL_AMENDMENT_FISCAL_COVERAGE_MESSAGE =
  "Commercial amendment rejected: accommodation charges are fiscally allocated; credit-note workflow required";

export interface CommercialAmendmentFolioAdjustmentDraft {
  folioId: string;
  tenantId: string;
  currency: string;
  /** Signed commercial delta (newTotal − previousTotal), 4dp. */
  deltaAmount: string;
  amendmentId: string;
  description: string;
  sortOrder: number;
}

/**
 * BFS-3a: validate rules for a future commercial adjustment FolioLine.
 * Does NOT post lines. BFS-3b will call Folio.appendPostedLine after this passes.
 */
export function validateCommercialAmendmentFolioAdjustment(input: {
  folio: Folio;
  deltaAmount: string;
  amendmentId: string;
  /** True when any accommodation line on this folio has issued fiscal coverage. */
  hasFiscalCoverageOnAccommodation: boolean;
  description?: string;
  sortOrder?: number;
}): CommercialAmendmentFolioAdjustmentDraft {
  if (input.folio.status === "closed") {
    throw new ValidationError(COMMERCIAL_AMENDMENT_FOLIO_CLOSED_MESSAGE);
  }

  if (input.hasFiscalCoverageOnAccommodation) {
    throw new ValidationError(COMMERCIAL_AMENDMENT_FISCAL_COVERAGE_MESSAGE);
  }

  const delta = Money.create(input.deltaAmount, input.folio.currency);
  if (delta.isZero()) {
    throw new ValidationError(
      "Commercial folio adjustment requires a non-zero signed delta",
    );
  }

  const description = (
    input.description ??
    `Commercial amendment ${input.amendmentId}`
  ).trim();
  if (!description) {
    throw new ValidationError("Commercial folio adjustment description required");
  }

  return {
    folioId: input.folio.id,
    tenantId: input.folio.tenantId,
    currency: input.folio.currency,
    deltaAmount: delta.amount,
    amendmentId: input.amendmentId,
    description,
    sortOrder: input.sortOrder ?? input.folio.lines.length,
  };
}

/**
 * Build FolioLine create input for BFS-3b (not posted in BFS-3a).
 * Kept here so provenance and line type stay centralized.
 */
export function commercialAmendmentAdjustmentLineSpec(
  draft: CommercialAmendmentFolioAdjustmentDraft,
  lineId: string,
  postedAt: Date = new Date(),
): {
  id: string;
  tenantId: string;
  folioId: string;
  lineType: "adjustment";
  description: string;
  amount: Money;
  source: {
    sourceType: typeof BOOKING_COMMERCIAL_AMENDMENT_SOURCE_TYPE;
    sourceId: string;
    sourceLineRef: string;
  };
  sortOrder: number;
  postedAt: Date;
} {
  return {
    id: lineId,
    tenantId: draft.tenantId,
    folioId: draft.folioId,
    lineType: "adjustment",
    description: draft.description,
    amount: Money.create(draft.deltaAmount, draft.currency),
    source: {
      sourceType: BOOKING_COMMERCIAL_AMENDMENT_SOURCE_TYPE,
      sourceId: draft.amendmentId,
      sourceLineRef: "commercial_delta",
    },
    sortOrder: draft.sortOrder,
    postedAt,
  };
}

/** Helper: detect accommodation lines that must not be rewritten by reprice. */
export function listAccommodationFolioLines(folio: Folio): FolioLine[] {
  return folio.lines.filter((l) => l.lineType === "accommodation");
}

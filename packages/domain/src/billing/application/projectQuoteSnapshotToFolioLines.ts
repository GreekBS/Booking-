import { Money } from "../../commerce/shared/value-objects/Money";
import type { QuoteSnapshot } from "../../commerce/booking/domain/QuoteSnapshot";
import { Folio, FolioLine } from "../domain/Folio";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";

/**
 * Projects an immutable commercial QuoteSnapshot into append-only FolioLines.
 * Does not live-link to RatePlan/Quote; amounts are copied at projection time.
 *
 * QuoteSnapshot feesAmount/taxesAmount are treated as compatibility placeholders
 * (sourceType quote_snapshot_*_placeholder) — NOT Greek VAT / climate fee.
 */
export function projectQuoteSnapshotToFolioLines(input: {
  folio: Folio;
  quoteId: string;
  snapshotId: string;
  snapshot: QuoteSnapshot;
  idGenerator: IIdGenerator;
  now?: Date;
}): FolioLine[] {
  const { folio, quoteId, snapshotId, snapshot, idGenerator } = input;
  const now = input.now ?? new Date();
  const lines: FolioLine[] = [];
  let sortOrder = 0;

  for (const night of snapshot.lineItems) {
    const amount = Money.create(night.adjustedAmount, snapshot.currency);
    lines.push(
      FolioLine.createPosted({
        id: idGenerator.generate(),
        tenantId: folio.tenantId,
        folioId: folio.id,
        lineType: "accommodation",
        description: `Accommodation ${night.date}`,
        amount,
        source: {
          sourceType: "quote_snapshot_night",
          sourceId: quoteId,
          sourceLineRef: `${snapshotId}:${night.date}`,
        },
        sortOrder: sortOrder++,
        postedAt: now,
      }),
    );
  }

  const fees = Money.create(snapshot.feesAmount, snapshot.currency);
  if (!fees.isZero()) {
    lines.push(
      FolioLine.createPosted({
        id: idGenerator.generate(),
        tenantId: folio.tenantId,
        folioId: folio.id,
        lineType: "fee",
        description:
          "Quote snapshot fees (placeholder — not fiscal tax engine)",
        amount: fees,
        source: {
          sourceType: "quote_snapshot_fee_placeholder",
          sourceId: quoteId,
          sourceLineRef: `${snapshotId}:fees`,
        },
        sortOrder: sortOrder++,
        postedAt: now,
      }),
    );
  }

  const taxes = Money.create(snapshot.taxesAmount, snapshot.currency);
  if (!taxes.isZero()) {
    lines.push(
      FolioLine.createPosted({
        id: idGenerator.generate(),
        tenantId: folio.tenantId,
        folioId: folio.id,
        lineType: "tax",
        description:
          "Quote snapshot taxes (placeholder — not Greek VAT / climate fee)",
        amount: taxes,
        source: {
          sourceType: "quote_snapshot_tax_placeholder",
          sourceId: quoteId,
          sourceLineRef: `${snapshotId}:taxes`,
        },
        sortOrder: sortOrder++,
        postedAt: now,
      }),
    );
  }

  // If snapshot has no night lines (edge), still record commercial total as accommodation.
  if (lines.length === 0) {
    const total = Money.create(snapshot.totalAmount, snapshot.currency);
    lines.push(
      FolioLine.createPosted({
        id: idGenerator.generate(),
        tenantId: folio.tenantId,
        folioId: folio.id,
        lineType: "accommodation",
        description: "Accommodation (quote snapshot total)",
        amount: total,
        source: {
          sourceType: "quote_snapshot",
          sourceId: quoteId,
          sourceLineRef: `${snapshotId}:total`,
        },
        sortOrder: 0,
        postedAt: now,
      }),
    );
  }

  return lines;
}

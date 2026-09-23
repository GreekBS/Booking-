import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../../commerce/shared/value-objects/Money";
import type { FolioLineTaxSnapshot } from "../../billing/domain/Folio";

export interface FiscalDocumentLineProps {
  id: string;
  tenantId: string;
  fiscalDocumentId: string;
  sortOrder: number;
  description: string;
  quantity: string;
  unit: string | null;
  /** Net (ex-VAT) amount for this line. */
  netAmount: string;
  vatAmount: string;
  /** Climate / other levy attributed to this line (usually 0 on VAT docs). */
  levyAmount: string;
  grossAmount: string;
  currency: string;
  classificationKey: string | null;
  taxSnapshot: FolioLineTaxSnapshot | null;
  sourceFolioId: string | null;
  sourceFolioLineId: string | null;
  /** Optional daily-use provenance for climate Special Element. */
  dailyUseProvenance: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

/**
 * Immutable fiscal document line snapshot.
 * Copied from posted FolioLines at draft/issue — never live-referenced.
 */
export class FiscalDocumentLine {
  private constructor(private readonly props: FiscalDocumentLineProps) {}

  static create(input: FiscalDocumentLineProps): FiscalDocumentLine {
    if (!input.description.trim()) {
      throw new ValidationError("FiscalDocumentLine description required");
    }
    const currency = input.currency.trim().toUpperCase();
    const net = Money.create(input.netAmount, currency);
    const vat = Money.create(input.vatAmount, currency);
    const levy = Money.create(input.levyAmount, currency);
    const gross = Money.create(input.grossAmount, currency);
    const expected = net.add(vat).add(levy);
    if (gross.amount !== expected.amount) {
      throw new ValidationError(
        `Line gross ${gross.amount} != net+vat+levy ${expected.amount}`,
      );
    }
    return new FiscalDocumentLine({
      ...input,
      currency,
      description: input.description.trim(),
      netAmount: net.amount,
      vatAmount: vat.amount,
      levyAmount: levy.amount,
      grossAmount: gross.amount,
      quantity: normalizeQuantity(input.quantity || "1.0000"),
      metadata: { ...input.metadata },
      dailyUseProvenance: input.dailyUseProvenance
        ? { ...input.dailyUseProvenance }
        : null,
      taxSnapshot: input.taxSnapshot
        ? {
            ...input.taxSnapshot,
            metadata: { ...input.taxSnapshot.metadata },
          }
        : null,
    });
  }

  static rehydrate(props: FiscalDocumentLineProps): FiscalDocumentLine {
    return new FiscalDocumentLine({
      ...props,
      metadata: { ...props.metadata },
      dailyUseProvenance: props.dailyUseProvenance
        ? { ...props.dailyUseProvenance }
        : null,
      taxSnapshot: props.taxSnapshot
        ? { ...props.taxSnapshot, metadata: { ...props.taxSnapshot.metadata } }
        : null,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get fiscalDocumentId(): string {
    return this.props.fiscalDocumentId;
  }
  get sourceFolioLineId(): string | null {
    return this.props.sourceFolioLineId;
  }
  get sourceFolioId(): string | null {
    return this.props.sourceFolioId;
  }
  get netAmount(): string {
    return this.props.netAmount;
  }
  get vatAmount(): string {
    return this.props.vatAmount;
  }
  get levyAmount(): string {
    return this.props.levyAmount;
  }
  get grossAmount(): string {
    return this.props.grossAmount;
  }
  get currency(): string {
    return this.props.currency;
  }

  toProps(): FiscalDocumentLineProps {
    return {
      ...this.props,
      metadata: { ...this.props.metadata },
      dailyUseProvenance: this.props.dailyUseProvenance
        ? { ...this.props.dailyUseProvenance }
        : null,
      taxSnapshot: this.props.taxSnapshot
        ? {
            ...this.props.taxSnapshot,
            metadata: { ...this.props.taxSnapshot.metadata },
          }
        : null,
    };
  }
}

function normalizeQuantity(raw: string): string {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new ValidationError(`Invalid quantity: ${raw}`);
  }
  const [w, f = ""] = trimmed.split(".");
  return `${w}.${`${f}0000`.slice(0, 4)}`;
}

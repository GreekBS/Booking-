import { AggregateRoot } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../../commerce/shared/value-objects/Money";

/** Folio lifecycle for F1 — open settlement surface; fiscal states come later. */
export type FolioStatus = "open" | "closed";

/**
 * Distinguishes intentional multi-folio roles from duplicate creation.
 * Unique per (tenantId, bookingId, folioKey). Default open uses "primary".
 */
export type FolioKey = string;

export type FolioLineType =
  | "accommodation"
  | "extra"
  | "service"
  | "discount"
  | "adjustment"
  | "fee"
  | "tax";

/**
 * Provenance for a posted line. Never a live FK into mutable pricing.
 * QuoteSnapshot fee/tax placeholders are tagged explicitly — they are NOT the Greek tax engine.
 */
export type FolioLineSourceType =
  | "quote_snapshot"
  | "quote_snapshot_night"
  | "quote_snapshot_fee_placeholder"
  | "quote_snapshot_tax_placeholder"
  | "manual"
  | "tax_evaluation";

export interface FolioLineSource {
  sourceType: FolioLineSourceType;
  /** Stable id of the commercial artifact (e.g. quoteId). */
  sourceId: string;
  /** Optional finer reference (night date, "fees", "taxes", snapshotId). */
  sourceLineRef: string | null;
}

/** Immutable tax/levy snapshot posted with a FolioLine (never live TaxRule). */
export interface FolioLineTaxSnapshot {
  taxType: string;
  classificationKey: string;
  calculationKind: string;
  appliedRatePercent: string | null;
  appliedFixedAmount: string | null;
  taxableBase: string | null;
  calculatedAmount: string;
  currency: string;
  ruleId: string;
  ruleScope: string;
  ruleValidFrom: string;
  ruleValidUntil: string | null;
  jurisdiction: string;
  legalSource: string | null;
  legalVersion: string | null;
  metadata: Record<string, unknown>;
}

export interface FolioLineProps {
  id: string;
  tenantId: string;
  folioId: string;
  lineType: FolioLineType;
  description: string;
  /** Signed amount string (4dp). Discounts/credit adjustments are negative. */
  amount: string;
  currency: string;
  source: FolioLineSource;
  sortOrder: number;
  postedAt: Date;
  taxSnapshot: FolioLineTaxSnapshot | null;
}

export interface FolioProps {
  id: string;
  tenantId: string;
  bookingId: string;
  /** Role key — "primary" for default folio; other keys for intentional splits. */
  folioKey: FolioKey;
  currency: string;
  status: FolioStatus;
  /** Optional human label (e.g. "Company", "Extras"). */
  label: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FolioBalance {
  currency: string;
  chargesSubtotal: string;
  discountsTotal: string;
  adjustmentsTotal: string;
  feesTotal: string;
  taxesTotal: string;
  /** Σ of all posted line amounts (signed). */
  folioTotal: string;
  /** Net settled on folio via payment allocations (minus reversals). */
  paidAmount: string;
  paidAmountSource: "no_allocations" | "allocations";
  /** Gross allocated to folio before reversals (F4). */
  allocatedPaidAmount?: string;
  /** Allocation reversals unsettling folio coverage (F4). */
  refundedAmount?: string;
  netSettledAmount?: string;
  overpaymentAmount?: string;
  outstandingBalance: string;
  /** Sum of posted VAT taxSnapshot lines (taxType=vat). */
  vatTotal: string;
  /** Sum of posted climate/other levy lines distinguished via taxSnapshot. */
  leviesTotal: string;
}

const PRIMARY_KEY = "primary";

function assertPositiveKey(folioKey: string): void {
  const trimmed = folioKey.trim();
  if (!trimmed || trimmed.length > 64) {
    throw new ValidationError("Invalid folio key");
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(trimmed)) {
    throw new ValidationError("Invalid folio key format");
  }
}

export class FolioLine {
  private constructor(private readonly props: FolioLineProps) {}

  static createPosted(input: {
    id: string;
    tenantId: string;
    folioId: string;
    lineType: FolioLineType;
    description: string;
    amount: Money;
    source: FolioLineSource;
    sortOrder: number;
    postedAt?: Date;
    taxSnapshot?: FolioLineTaxSnapshot | null;
  }): FolioLine {
    if (!input.description.trim()) {
      throw new ValidationError("Folio line description required");
    }
    return new FolioLine({
      id: input.id,
      tenantId: input.tenantId,
      folioId: input.folioId,
      lineType: input.lineType,
      description: input.description.trim(),
      amount: input.amount.amount,
      currency: input.amount.currency,
      source: {
        sourceType: input.source.sourceType,
        sourceId: input.source.sourceId,
        sourceLineRef: input.source.sourceLineRef,
      },
      sortOrder: input.sortOrder,
      postedAt: input.postedAt ?? new Date(),
      taxSnapshot: input.taxSnapshot ? { ...input.taxSnapshot, metadata: { ...input.taxSnapshot.metadata } } : null,
    });
  }

  static rehydrate(props: FolioLineProps): FolioLine {
    return new FolioLine({
      ...props,
      postedAt: new Date(props.postedAt),
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

  get folioId(): string {
    return this.props.folioId;
  }

  get lineType(): FolioLineType {
    return this.props.lineType;
  }

  get description(): string {
    return this.props.description;
  }

  get amount(): string {
    return this.props.amount;
  }

  get currency(): string {
    return this.props.currency;
  }

  get source(): FolioLineSource {
    return { ...this.props.source };
  }

  get sortOrder(): number {
    return this.props.sortOrder;
  }

  get postedAt(): Date {
    return this.props.postedAt;
  }

  get taxSnapshot(): FolioLineTaxSnapshot | null {
    return this.props.taxSnapshot
      ? { ...this.props.taxSnapshot, metadata: { ...this.props.taxSnapshot.metadata } }
      : null;
  }

  toProps(): FolioLineProps {
    return {
      ...this.props,
      source: { ...this.props.source },
      postedAt: new Date(this.props.postedAt),
      taxSnapshot: this.props.taxSnapshot
        ? {
            ...this.props.taxSnapshot,
            metadata: { ...this.props.taxSnapshot.metadata },
          }
        : null,
    };
  }

  money(): Money {
    return Money.create(this.props.amount, this.props.currency);
  }
}

export class Folio extends AggregateRoot<FolioProps> {
  private _lines: FolioLine[];

  private constructor(props: FolioProps, lines: FolioLine[]) {
    super(props);
    this._lines = lines;
  }

  static primaryKey(): typeof PRIMARY_KEY {
    return PRIMARY_KEY;
  }

  static open(input: {
    id: string;
    tenantId: string;
    bookingId: string;
    currency: string;
    folioKey?: string;
    label?: string | null;
    now?: Date;
  }): Folio {
    const folioKey = (input.folioKey ?? PRIMARY_KEY).trim();
    assertPositiveKey(folioKey);
    const currency = input.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new ValidationError(`Invalid currency: ${input.currency}`);
    }
    const now = input.now ?? new Date();
    return new Folio(
      {
        id: input.id,
        tenantId: input.tenantId,
        bookingId: input.bookingId,
        folioKey,
        currency,
        status: "open",
        label: input.label?.trim() || null,
        createdAt: now,
        updatedAt: now,
      },
      [],
    );
  }

  static rehydrate(props: FolioProps, lines: FolioLine[] = []): Folio {
    return new Folio(
      {
        ...props,
        createdAt: new Date(props.createdAt),
        updatedAt: new Date(props.updatedAt),
      },
      lines,
    );
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get bookingId(): string {
    return this.props.bookingId;
  }

  get folioKey(): string {
    return this.props.folioKey;
  }

  get currency(): string {
    return this.props.currency;
  }

  get status(): FolioStatus {
    return this.props.status;
  }

  get label(): string | null {
    return this.props.label;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get lines(): readonly FolioLine[] {
    return this._lines;
  }

  toProps(): FolioProps {
    return {
      ...this.props,
      createdAt: new Date(this.props.createdAt),
      updatedAt: new Date(this.props.updatedAt),
    };
  }

  /**
   * Append a posted line. Posted lines are immutable thereafter —
   * there is no update/delete API on FolioLine.
   */
  appendPostedLine(line: FolioLine): void {
    if (line.tenantId !== this.props.tenantId) {
      throw new ValidationError("Folio line tenant mismatch");
    }
    if (line.folioId !== this.props.id) {
      throw new ValidationError("Folio line folio mismatch");
    }
    if (line.currency !== this.props.currency) {
      throw new ValidationError("Folio line currency mismatch");
    }
    if (this._lines.some((existing) => existing.id === line.id)) {
      throw new ValidationError("Duplicate folio line id");
    }
    this._lines = [...this._lines, line];
    this.props.updatedAt = new Date();
  }

  computeBalance(settlement?: {
    netSettledAmount: string;
    allocatedPaidAmount?: string;
    refundedAmount?: string;
    overpaymentAmount?: string;
    paidAmountSource?: "no_allocations" | "allocations";
  }): FolioBalance {
    const currency = this.props.currency;
    let charges = Money.zero(currency);
    let discounts = Money.zero(currency);
    let adjustments = Money.zero(currency);
    let fees = Money.zero(currency);
    let taxes = Money.zero(currency);
    let total = Money.zero(currency);

    for (const line of this._lines) {
      const m = line.money();
      total = total.add(m);
      switch (line.lineType) {
        case "accommodation":
        case "extra":
        case "service":
          charges = charges.add(m);
          break;
        case "discount":
          discounts = discounts.add(m);
          break;
        case "adjustment":
          adjustments = adjustments.add(m);
          break;
        case "fee":
          fees = fees.add(m);
          break;
        case "tax":
          taxes = taxes.add(m);
          break;
        default: {
          const _exhaustive: never = line.lineType;
          void _exhaustive;
        }
      }
    }

    let paid: Money;
    let paidAmountSource: FolioBalance["paidAmountSource"] = "no_allocations";
    let allocatedPaidAmount: string | undefined;
    let refundedAmount: string | undefined;
    let netSettledAmount: string | undefined;
    let overpaymentAmount: string | undefined;
    let outstanding: Money;

    if (settlement) {
      const net = Money.create(settlement.netSettledAmount, currency);
      paid = net;
      paidAmountSource = settlement.paidAmountSource ?? "allocations";
      allocatedPaidAmount = settlement.allocatedPaidAmount;
      refundedAmount = settlement.refundedAmount;
      netSettledAmount = settlement.netSettledAmount;
      overpaymentAmount =
        settlement.overpaymentAmount ??
        (toScaled(net.amount) > toScaled(total.amount)
          ? net.subtract(total).amount
          : Money.zero(currency).amount);
      outstanding = total.subtract(net);
      if (toScaled(outstanding.amount) < 0n) {
        outstanding = Money.zero(currency);
      }
    } else {
      paid = Money.zero(currency);
      outstanding = total.subtract(paid);
    }

    let vatTotal = Money.zero(currency);
    let leviesTotal = Money.zero(currency);
    for (const line of this._lines) {
      const snap = line.taxSnapshot;
      if (!snap) continue;
      const m = Money.create(snap.calculatedAmount, snap.currency);
      if (snap.taxType === "vat") vatTotal = vatTotal.add(m);
      else leviesTotal = leviesTotal.add(m);
    }

    return {
      currency,
      chargesSubtotal: charges.amount,
      discountsTotal: discounts.amount,
      adjustmentsTotal: adjustments.amount,
      feesTotal: fees.amount,
      taxesTotal: taxes.amount,
      folioTotal: total.amount,
      paidAmount: paid.amount,
      paidAmountSource,
      ...(allocatedPaidAmount !== undefined ? { allocatedPaidAmount } : {}),
      ...(refundedAmount !== undefined ? { refundedAmount } : {}),
      ...(netSettledAmount !== undefined ? { netSettledAmount } : {}),
      ...(overpaymentAmount !== undefined ? { overpaymentAmount } : {}),
      outstandingBalance: outstanding.amount,
      vatTotal: vatTotal.amount,
      leviesTotal: leviesTotal.amount,
    };
  }
}

function toScaled(amount: string): bigint {
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const parts = unsigned.split(".");
  const w = parts[0] ?? "0";
  const f = (parts[1] ?? "0000").padEnd(4, "0").slice(0, 4);
  const scaled = BigInt(w) * 10_000n + BigInt(f);
  return negative ? -scaled : scaled;
}

import { AggregateRoot } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../../commerce/shared/value-objects/Money";
import type { FiscalDocumentKind } from "./FiscalDocumentKinds";
import {
  isClimateFeeDocumentKind,
  isCreditDocumentKind,
} from "./FiscalDocumentKinds";
import type { FiscalDocumentStatus } from "./FiscalDocumentStatus";
import type {
  FiscalCustomerSnapshot,
  FiscalIssuerSnapshot,
} from "./FiscalPartySnapshots";
import { FiscalDocumentLine } from "./FiscalDocumentLine";
import {
  assertTotalsReconcile,
  buildTotalsFromLines,
  type FiscalDocumentTotals,
  type FiscalRoundingPolicyId,
} from "./FiscalRoundingPolicy";
import { FiscalDocumentIssuedEvent } from "./events/FiscalDocumentEvents";

export interface FiscalDocumentCorrelation {
  originalDocumentId: string;
  reason: string;
  creditedScope: "full" | "partial";
}

export interface FiscalDocumentProps {
  id: string;
  tenantId: string;
  propertyId: string;
  documentKind: FiscalDocumentKind;
  status: FiscalDocumentStatus;
  seriesId: string | null;
  seriesCode: string | null;
  sequenceNumber: number | null;
  /** Stable key for IssueFiscalDocument — unique per tenant when set. */
  issuanceIdempotencyKey: string | null;
  issuedAt: Date | null;
  currency: string;
  issuerSnapshot: FiscalIssuerSnapshot | null;
  customerSnapshot: FiscalCustomerSnapshot | null;
  totals: FiscalDocumentTotals;
  roundingPolicy: FiscalRoundingPolicyId;
  paymentMethodSummary: string | null;
  sourceBookingId: string | null;
  correlation: FiscalDocumentCorrelation | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FiscalDocumentWithLines {
  document: FiscalDocument;
  lines: FiscalDocumentLine[];
}

/**
 * Immutable financial/legal snapshot after ISSUED.
 * Greek myDATA codes are NOT part of this aggregate.
 */
export class FiscalDocument extends AggregateRoot<FiscalDocumentProps> {
  private constructor(props: FiscalDocumentProps) {
    super(props);
  }

  static createDraft(input: {
    id: string;
    tenantId: string;
    propertyId: string;
    documentKind: FiscalDocumentKind;
    seriesId: string;
    seriesCode: string;
    currency: string;
    issuerSnapshot: FiscalIssuerSnapshot;
    customerSnapshot: FiscalCustomerSnapshot | null;
    lines: FiscalDocumentLine[];
    paymentMethodSummary?: string | null;
    sourceBookingId?: string | null;
    correlation?: FiscalDocumentCorrelation | null;
    metadata?: Record<string, unknown>;
    roundingPolicy?: FiscalRoundingPolicyId;
    now?: Date;
  }): FiscalDocumentWithLines {
    const now = input.now ?? new Date();
    const currency = input.currency.trim().toUpperCase();
    if (currency.length !== 3) {
      throw new ValidationError("Invalid document currency");
    }

    validateKindRequirements(input);

    if (input.lines.length === 0) {
      throw new ValidationError("FiscalDocument requires at least one line");
    }
    for (const line of input.lines) {
      if (line.currency !== currency) {
        throw new ValidationError("Document line currency mismatch");
      }
      if (line.fiscalDocumentId !== input.id) {
        throw new ValidationError("Line fiscalDocumentId mismatch");
      }
      if (line.tenantId !== input.tenantId) {
        throw new ValidationError("Line tenant mismatch");
      }
    }

    if (isCreditDocumentKind(input.documentKind)) {
      if (!input.correlation?.originalDocumentId) {
        throw new ValidationError("Credit document requires originalDocumentId");
      }
      if (!input.correlation.reason?.trim()) {
        throw new ValidationError("Credit document requires reason");
      }
    }

    if (isClimateFeeDocumentKind(input.documentKind)) {
      for (const line of input.lines) {
        const snap = line.toProps().taxSnapshot;
        if (!snap || snap.taxType !== "climate_resilience_fee") {
          throw new ValidationError(
            "Climate Special Element lines must carry climate_resilience_fee taxSnapshot",
          );
        }
      }
    }

    const roundingPolicy = input.roundingPolicy ?? "deterministic_money_4dp";
    const totals = buildTotalsFromLines(
      currency,
      input.lines.map((l) => ({
        netAmount: l.netAmount,
        vatAmount: l.vatAmount,
        levyAmount: l.levyAmount,
        grossAmount: l.grossAmount,
      })),
    );

    const document = new FiscalDocument({
      id: input.id,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      documentKind: input.documentKind,
      status: "DRAFT",
      seriesId: input.seriesId,
      seriesCode: input.seriesCode,
      sequenceNumber: null,
      issuanceIdempotencyKey: null,
      issuedAt: null,
      currency,
      issuerSnapshot: cloneIssuer(input.issuerSnapshot),
      customerSnapshot: input.customerSnapshot
        ? cloneCustomer(input.customerSnapshot)
        : null,
      totals,
      roundingPolicy,
      paymentMethodSummary: input.paymentMethodSummary?.trim() || null,
      sourceBookingId: input.sourceBookingId ?? null,
      correlation: input.correlation
        ? {
            originalDocumentId: input.correlation.originalDocumentId,
            reason: input.correlation.reason.trim(),
            creditedScope: input.correlation.creditedScope,
          }
        : null,
      metadata: { ...(input.metadata ?? {}) },
      createdAt: now,
      updatedAt: now,
    });

    return { document, lines: input.lines.map((l) => FiscalDocumentLine.rehydrate(l.toProps())) };
  }

  static rehydrate(
    props: FiscalDocumentProps,
    lines: FiscalDocumentLine[] = [],
  ): FiscalDocumentWithLines {
    const document = new FiscalDocument({
      ...props,
      issuerSnapshot: props.issuerSnapshot ? cloneIssuer(props.issuerSnapshot) : null,
      customerSnapshot: props.customerSnapshot
        ? cloneCustomer(props.customerSnapshot)
        : null,
      totals: { ...props.totals },
      correlation: props.correlation ? { ...props.correlation } : null,
      metadata: { ...props.metadata },
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
      issuedAt: props.issuedAt ? new Date(props.issuedAt) : null,
    });
    return {
      document,
      lines: lines.map((l) => FiscalDocumentLine.rehydrate(l.toProps())),
    };
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get propertyId(): string {
    return this.props.propertyId;
  }
  get documentKind(): FiscalDocumentKind {
    return this.props.documentKind;
  }
  get status(): FiscalDocumentStatus {
    return this.props.status;
  }
  get seriesId(): string | null {
    return this.props.seriesId;
  }
  get sequenceNumber(): number | null {
    return this.props.sequenceNumber;
  }
  get issuanceIdempotencyKey(): string | null {
    return this.props.issuanceIdempotencyKey;
  }
  get currency(): string {
    return this.props.currency;
  }
  get totals(): FiscalDocumentTotals {
    return { ...this.props.totals };
  }
  get correlation(): FiscalDocumentCorrelation | null {
    return this.props.correlation ? { ...this.props.correlation } : null;
  }
  get issuerSnapshot(): FiscalIssuerSnapshot | null {
    return this.props.issuerSnapshot
      ? cloneIssuer(this.props.issuerSnapshot)
      : null;
  }
  get customerSnapshot(): FiscalCustomerSnapshot | null {
    return this.props.customerSnapshot
      ? cloneCustomer(this.props.customerSnapshot)
      : null;
  }
  get sourceBookingId(): string | null {
    return this.props.sourceBookingId;
  }
  get issuedAt(): Date | null {
    return this.props.issuedAt ? new Date(this.props.issuedAt) : null;
  }
  get seriesCode(): string | null {
    return this.props.seriesCode;
  }

  toProps(): FiscalDocumentProps {
    return {
      ...this.props,
      issuerSnapshot: this.props.issuerSnapshot
        ? cloneIssuer(this.props.issuerSnapshot)
        : null,
      customerSnapshot: this.props.customerSnapshot
        ? cloneCustomer(this.props.customerSnapshot)
        : null,
      totals: { ...this.props.totals },
      correlation: this.props.correlation ? { ...this.props.correlation } : null,
      metadata: { ...this.props.metadata },
      createdAt: new Date(this.props.createdAt),
      updatedAt: new Date(this.props.updatedAt),
      issuedAt: this.props.issuedAt ? new Date(this.props.issuedAt) : null,
    };
  }

  assertDraft(): void {
    if (this.props.status !== "DRAFT") {
      throw new ValidationError("Only DRAFT fiscal documents may be edited");
    }
  }

  assertIssuedImmutable(): void {
    if (this.props.status === "ISSUED") {
      throw new ValidationError("ISSUED fiscal document financial body is immutable");
    }
  }

  /**
   * Domain-side issue transition. Sequence is supplied by PostgreSQL allocation
   * inside the same DB transaction as persistence — never pre-allocated in UI.
   */
  markIssued(input: {
    sequenceNumber: number;
    issuanceIdempotencyKey: string;
    lines: FiscalDocumentLine[];
    now?: Date;
  }): void {
    if (this.props.status !== "DRAFT") {
      throw new ValidationError("Only DRAFT documents can be issued");
    }
    if (!Number.isInteger(input.sequenceNumber) || input.sequenceNumber < 1) {
      throw new ValidationError("Invalid sequence number");
    }
    const key = input.issuanceIdempotencyKey.trim();
    if (!key || key.length > 128) {
      throw new ValidationError("issuanceIdempotencyKey required (max 128)");
    }
    if (!this.props.issuerSnapshot) {
      throw new ValidationError("Issuer snapshot required at issuance");
    }
    validateKindRequirements({
      documentKind: this.props.documentKind,
      customerSnapshot: this.props.customerSnapshot,
      correlation: this.props.correlation,
    });

    assertTotalsReconcile(
      this.props.totals,
      input.lines.map((l) => l.netAmount),
      input.lines.map((l) => l.vatAmount),
      input.lines.map((l) => l.levyAmount),
      input.lines.map((l) =>
        Money.create(l.netAmount, this.props.currency)
          .add(Money.create(l.vatAmount, this.props.currency))
          .add(Money.create(l.levyAmount, this.props.currency)).amount,
      ),
      this.props.roundingPolicy,
    );

    const now = input.now ?? new Date();
    this.props.status = "ISSUED";
    this.props.sequenceNumber = input.sequenceNumber;
    this.props.issuanceIdempotencyKey = key;
    this.props.issuedAt = now;
    this.props.updatedAt = now;

    this.addDomainEvent(
      new FiscalDocumentIssuedEvent(this.id, this.props.tenantId, {
        documentKind: this.props.documentKind,
        seriesId: this.props.seriesId,
        seriesCode: this.props.seriesCode,
        sequenceNumber: input.sequenceNumber,
        currency: this.props.currency,
        grossTotal: this.props.totals.grossTotal,
        propertyId: this.props.propertyId,
        sourceBookingId: this.props.sourceBookingId,
        issuanceIdempotencyKey: key,
      }),
    );
  }

  /** Display number e.g. APY-42 — only after issue. */
  documentNumber(): string | null {
    if (this.props.sequenceNumber == null || !this.props.seriesCode) return null;
    return `${this.props.seriesCode}-${this.props.sequenceNumber}`;
  }
}

function validateKindRequirements(input: {
  documentKind: FiscalDocumentKind;
  customerSnapshot: FiscalCustomerSnapshot | null;
  correlation?: FiscalDocumentCorrelation | null;
}): void {
  if (input.documentKind === "SERVICE_INVOICE") {
    const c = input.customerSnapshot;
    if (!c || c.type !== "BUSINESS" || !c.vatNumber?.trim()) {
      throw new ValidationError(
        "SERVICE_INVOICE requires BUSINESS CustomerBillingProfile with AFM/VAT",
      );
    }
  }
  if (input.documentKind === "SERVICE_CREDIT") {
    const c = input.customerSnapshot;
    if (!c || c.type !== "BUSINESS" || !c.vatNumber?.trim()) {
      throw new ValidationError(
        "SERVICE_CREDIT requires BUSINESS CustomerBillingProfile with AFM/VAT",
      );
    }
  }
}

function cloneIssuer(s: FiscalIssuerSnapshot): FiscalIssuerSnapshot {
  return {
    ...s,
    address: { ...s.address },
  };
}

function cloneCustomer(s: FiscalCustomerSnapshot): FiscalCustomerSnapshot {
  return {
    ...s,
    address: s.address ? { ...s.address } : null,
  };
}

/** Remaining credit capacity on an original issued document (gross). */
export function assertCreditWithinOriginal(
  originalGross: string,
  currency: string,
  alreadyCreditedGrossAbs: string,
  newCreditGrossAbs: string,
): void {
  const original = Money.create(originalGross, currency);
  const already = Money.create(alreadyCreditedGrossAbs, currency);
  const next = Money.create(newCreditGrossAbs, currency);
  if (next.isNegative() || next.isZero()) {
    throw new ValidationError("Credit amount must be positive");
  }
  const remaining = original.subtract(already);
  const after = remaining.subtract(next);
  if (after.isNegative()) {
    throw new ValidationError(
      `Credit ${next.amount} exceeds remaining ${remaining.amount} on original`,
    );
  }
}

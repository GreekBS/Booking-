import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../../commerce/shared/value-objects/Money";

/**
 * Amount-level fiscal coverage of a FolioLine by a FiscalDocumentLine.
 * Partial fiscalization is first-class — never a single boolean.
 */
export interface FiscalLineAllocationProps {
  id: string;
  tenantId: string;
  folioId: string;
  folioLineId: string;
  fiscalDocumentId: string;
  fiscalDocumentLineId: string;
  /** Absolute allocated amount in folio line currency (4dp). */
  allocatedAmount: string;
  currency: string;
  createdAt: Date;
}

export class FiscalLineAllocation {
  private constructor(private readonly props: FiscalLineAllocationProps) {}

  static create(input: FiscalLineAllocationProps): FiscalLineAllocation {
    const currency = input.currency.trim().toUpperCase();
    const amount = Money.create(input.allocatedAmount, currency);
    if (toScaled(amount.amount) <= 0n) {
      throw new ValidationError("allocatedAmount must be positive");
    }
    return new FiscalLineAllocation({
      ...input,
      currency,
      allocatedAmount: amount.amount,
      createdAt: new Date(input.createdAt),
    });
  }

  static rehydrate(props: FiscalLineAllocationProps): FiscalLineAllocation {
    return new FiscalLineAllocation({
      ...props,
      createdAt: new Date(props.createdAt),
    });
  }

  get id(): string {
    return this.props.id;
  }
  get folioLineId(): string {
    return this.props.folioLineId;
  }
  get allocatedAmount(): string {
    return this.props.allocatedAmount;
  }
  get currency(): string {
    return this.props.currency;
  }
  get fiscalDocumentId(): string {
    return this.props.fiscalDocumentId;
  }

  toProps(): FiscalLineAllocationProps {
    return { ...this.props, createdAt: new Date(this.props.createdAt) };
  }
}

export type FolioLineFiscalCoverageStatus =
  | "unfiscalized"
  | "partially_fiscalized"
  | "fully_fiscalized";

export interface FolioLineFiscalCoverage {
  folioLineId: string;
  lineAmountAbs: string;
  allocatedAbs: string;
  remainingAbs: string;
  status: FolioLineFiscalCoverageStatus;
  currency: string;
}

export function computeFolioLineCoverage(
  folioLineId: string,
  lineAmount: string,
  currency: string,
  allocations: readonly FiscalLineAllocation[],
): FolioLineFiscalCoverage {
  const lineAbs = absMoney(lineAmount, currency);
  let allocated = Money.zero(currency);
  for (const a of allocations) {
    if (a.folioLineId !== folioLineId) continue;
    if (a.currency !== currency) {
      throw new ValidationError("Allocation currency mismatch");
    }
    allocated = allocated.add(Money.create(a.allocatedAmount, currency));
  }
  if (toScaled(allocated.amount) > toScaled(lineAbs.amount)) {
    throw new ValidationError(
      `Over-allocation on FolioLine ${folioLineId}: ${allocated.amount} > ${lineAbs.amount}`,
    );
  }
  const remaining = lineAbs.subtract(allocated);
  let status: FolioLineFiscalCoverageStatus = "unfiscalized";
  if (toScaled(allocated.amount) === 0n) status = "unfiscalized";
  else if (toScaled(remaining.amount) === 0n) status = "fully_fiscalized";
  else status = "partially_fiscalized";

  return {
    folioLineId,
    lineAmountAbs: lineAbs.amount,
    allocatedAbs: allocated.amount,
    remainingAbs: remaining.amount,
    status,
    currency,
  };
}

export function assertCanAllocate(
  lineAmount: string,
  currency: string,
  existingAllocatedAbs: string,
  newAllocationAbs: string,
): void {
  const lineAbs = absMoney(lineAmount, currency);
  const existing = Money.create(existingAllocatedAbs, currency);
  const next = Money.create(newAllocationAbs, currency);
  const total = existing.add(next);
  if (toScaled(total.amount) > toScaled(lineAbs.amount)) {
    throw new ValidationError(
      `Cannot allocate ${next.amount}; remaining capacity is ${lineAbs.subtract(existing).amount}`,
    );
  }
}

function absMoney(amount: string, currency: string): Money {
  const m = Money.create(amount, currency);
  return toScaled(m.amount) < 0n
    ? Money.create(m.amount.slice(1), currency)
    : m;
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

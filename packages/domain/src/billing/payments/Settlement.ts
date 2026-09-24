import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../../commerce/shared/value-objects/Money";
import type { RefundStatus } from "./PaymentKinds";

export interface SettlementAmountLine {
  amount: string;
  currency: string;
}

export interface SettlementRefundLine extends SettlementAmountLine {
  status: RefundStatus;
}

export interface PaymentAvailabilityInput {
  amount: string;
  currency: string;
  allocations: readonly SettlementAmountLine[];
  reversals: readonly SettlementAmountLine[];
  refunds: readonly SettlementRefundLine[];
}

export interface PaymentAvailability {
  allocatedNet: string;
  refundedEffective: string;
  availableToAllocate: string;
  refundable: string;
  currency: string;
}

export interface FolioSettlementInput {
  folioTotal: string;
  currency: string;
  allocationsToFolio: readonly SettlementAmountLine[];
  reversalsForThoseAllocations: readonly SettlementAmountLine[];
}

export interface FolioSettlementAmounts {
  currency: string;
  allocatedPaidAmount: string;
  /** Sum of allocation reversals — unsettled portion returned to the payment pool. */
  refundedAmount: string;
  netSettledAmount: string;
  outstandingAmount: string;
  overpaymentAmount: string;
  paidAmountSource: "allocations" | "no_allocations";
}

function sumMoney(
  currency: string,
  lines: readonly SettlementAmountLine[],
): Money {
  let total = Money.zero(currency);
  for (const line of lines) {
    assertSameCurrency(currency, line.currency);
    const m = Money.create(line.amount, currency);
    if (toScaled(m.amount) <= 0n) {
      throw new ValidationError("Settlement amounts must be positive");
    }
    total = total.add(m);
  }
  return total;
}

function assertSameCurrency(expected: string, actual: string): void {
  if (actual.trim().toUpperCase() !== expected.trim().toUpperCase()) {
    throw new ValidationError("Currency mismatch in settlement calculation");
  }
}

function maxZero(m: Money): Money {
  return toScaled(m.amount) < 0n ? Money.zero(m.currency) : m;
}

export function computePaymentAvailability(
  input: PaymentAvailabilityInput,
): PaymentAvailability {
  const currency = input.currency.trim().toUpperCase();
  const paymentAmount = Money.create(input.amount, currency);
  if (toScaled(paymentAmount.amount) <= 0n) {
    throw new ValidationError("Payment amount must be positive");
  }

  const allocatedNet = sumMoney(currency, input.allocations).subtract(
    sumMoney(currency, input.reversals),
  );
  if (toScaled(allocatedNet.amount) < 0n) {
    throw new ValidationError("allocatedNet cannot be negative");
  }

  let refundedEffective = Money.zero(currency);
  for (const refund of input.refunds) {
    assertSameCurrency(currency, refund.currency);
    if (refund.status !== "SUCCEEDED") continue;
    const m = Money.create(refund.amount, currency);
    if (toScaled(m.amount) <= 0n) {
      throw new ValidationError("Refund amount must be positive");
    }
    refundedEffective = refundedEffective.add(m);
  }

  const availableRaw = paymentAmount.subtract(allocatedNet).subtract(refundedEffective);
  if (toScaled(availableRaw.amount) < 0n) {
    throw new ValidationError("availableToAllocate cannot be negative");
  }

  const refundableRaw = paymentAmount.subtract(refundedEffective);
  if (toScaled(refundableRaw.amount) < 0n) {
    throw new ValidationError("refundable cannot be negative");
  }

  return {
    currency,
    allocatedNet: allocatedNet.amount,
    refundedEffective: refundedEffective.amount,
    availableToAllocate: maxZero(availableRaw).amount,
    refundable: maxZero(refundableRaw).amount,
  };
}

export function assertCanAllocatePayment(available: string, request: string, currency: string): void {
  const avail = Money.create(available, currency);
  const req = Money.create(request, currency);
  if (toScaled(req.amount) <= 0n) {
    throw new ValidationError("Allocation amount must be positive");
  }
  if (toScaled(req.amount) > toScaled(avail.amount)) {
    throw new ValidationError(
      `Cannot allocate ${req.amount}; available ${avail.amount}`,
    );
  }
}

export function assertCanRefund(refundable: string, request: string, currency: string): void {
  const cap = Money.create(refundable, currency);
  const req = Money.create(request, currency);
  if (toScaled(req.amount) <= 0n) {
    throw new ValidationError("Refund amount must be positive");
  }
  if (toScaled(req.amount) > toScaled(cap.amount)) {
    throw new ValidationError(`Cannot refund ${req.amount}; refundable ${cap.amount}`);
  }
}

export function assertCanReverse(
  allocationAmount: string,
  existingReversalsForAlloc: readonly SettlementAmountLine[],
  request: string,
  currency: string,
): void {
  const alloc = Money.create(allocationAmount, currency);
  const reversed = sumMoney(currency, existingReversalsForAlloc);
  const req = Money.create(request, currency);
  if (toScaled(req.amount) <= 0n) {
    throw new ValidationError("Reversal amount must be positive");
  }
  const remaining = alloc.subtract(reversed);
  if (toScaled(req.amount) > toScaled(remaining.amount)) {
    throw new ValidationError(
      `Cannot reverse ${req.amount}; remaining reversible ${remaining.amount}`,
    );
  }
}

export function computeFolioSettlement(input: FolioSettlementInput): FolioSettlementAmounts {
  const currency = input.currency.trim().toUpperCase();
  const folioTotal = Money.create(input.folioTotal, currency);
  const allocatedPaidAmount = sumMoney(currency, input.allocationsToFolio);
  const refundedAmount = sumMoney(currency, input.reversalsForThoseAllocations);
  const netSettled = allocatedPaidAmount.subtract(refundedAmount);
  if (toScaled(netSettled.amount) < 0n) {
    throw new ValidationError("netSettledAmount cannot be negative");
  }

  const outstandingAmount = maxZero(folioTotal.subtract(netSettled));
  const overpaymentAmount = maxZero(netSettled.subtract(folioTotal));

  const paidAmountSource: FolioSettlementAmounts["paidAmountSource"] =
    toScaled(allocatedPaidAmount.amount) > 0n || toScaled(netSettled.amount) > 0n
      ? "allocations"
      : "no_allocations";

  return {
    currency,
    allocatedPaidAmount: allocatedPaidAmount.amount,
    refundedAmount: refundedAmount.amount,
    netSettledAmount: netSettled.amount,
    outstandingAmount: outstandingAmount.amount,
    overpaymentAmount: overpaymentAmount.amount,
    paidAmountSource,
  };
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

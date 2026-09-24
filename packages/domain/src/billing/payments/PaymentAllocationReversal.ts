import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../../commerce/shared/value-objects/Money";
import { assertCompatibleCurrency } from "./Payment";

export interface PaymentAllocationReversalProps {
  id: string;
  tenantId: string;
  paymentId: string;
  allocationId: string;
  reversedAmount: string;
  currency: string;
  reason: string;
  createdAt: Date;
  createdByActorId: string | null;
  metadata: Record<string, unknown>;
}

export class PaymentAllocationReversal {
  private constructor(private readonly props: PaymentAllocationReversalProps) {}

  static create(input: {
    id: string;
    tenantId: string;
    paymentId: string;
    allocationId: string;
    reversedAmount: Money;
    allocationCurrency: string;
    reason: string;
    createdAt?: Date;
    createdByActorId?: string | null;
    metadata?: Record<string, unknown>;
  }): PaymentAllocationReversal {
    const currency = input.reversedAmount.currency;
    assertCompatibleCurrency(input.allocationCurrency, currency);
    const reason = input.reason.trim();
    if (!reason) {
      throw new ValidationError("Reversal reason required");
    }
    if (toScaled(input.reversedAmount.amount) <= 0n) {
      throw new ValidationError("reversedAmount must be positive");
    }
    return new PaymentAllocationReversal({
      id: input.id,
      tenantId: input.tenantId,
      paymentId: input.paymentId,
      allocationId: input.allocationId,
      reversedAmount: input.reversedAmount.amount,
      currency,
      reason,
      createdAt: input.createdAt ?? new Date(),
      createdByActorId: input.createdByActorId ?? null,
      metadata: { ...(input.metadata ?? {}) },
    });
  }

  static rehydrate(props: PaymentAllocationReversalProps): PaymentAllocationReversal {
    return new PaymentAllocationReversal({
      ...props,
      metadata: { ...props.metadata },
      createdAt: new Date(props.createdAt),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get allocationId(): string {
    return this.props.allocationId;
  }

  get reversedAmount(): string {
    return this.props.reversedAmount;
  }

  get currency(): string {
    return this.props.currency;
  }

  toProps(): PaymentAllocationReversalProps {
    return {
      ...this.props,
      metadata: { ...this.props.metadata },
      createdAt: new Date(this.props.createdAt),
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

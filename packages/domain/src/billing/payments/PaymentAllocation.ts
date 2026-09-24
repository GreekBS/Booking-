import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../../commerce/shared/value-objects/Money";
import { assertCompatibleCurrency } from "./Payment";

export interface PaymentAllocationProps {
  id: string;
  tenantId: string;
  paymentId: string;
  folioId: string;
  allocatedAmount: string;
  currency: string;
  createdAt: Date;
  createdByActorId: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
}

export class PaymentAllocation {
  private constructor(private readonly props: PaymentAllocationProps) {}

  static create(input: {
    id: string;
    tenantId: string;
    paymentId: string;
    folioId: string;
    allocatedAmount: Money;
    paymentCurrency: string;
    createdAt?: Date;
    createdByActorId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }): PaymentAllocation {
    const currency = input.allocatedAmount.currency;
    assertCompatibleCurrency(input.paymentCurrency, currency);
    if (toScaled(input.allocatedAmount.amount) <= 0n) {
      throw new ValidationError("allocatedAmount must be positive");
    }
    return new PaymentAllocation({
      id: input.id,
      tenantId: input.tenantId,
      paymentId: input.paymentId,
      folioId: input.folioId,
      allocatedAmount: input.allocatedAmount.amount,
      currency,
      createdAt: input.createdAt ?? new Date(),
      createdByActorId: input.createdByActorId ?? null,
      reason: input.reason?.trim() || null,
      metadata: { ...(input.metadata ?? {}) },
    });
  }

  static rehydrate(props: PaymentAllocationProps): PaymentAllocation {
    return new PaymentAllocation({
      ...props,
      metadata: { ...props.metadata },
      createdAt: new Date(props.createdAt),
    });
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get paymentId(): string {
    return this.props.paymentId;
  }

  get folioId(): string {
    return this.props.folioId;
  }

  get allocatedAmount(): string {
    return this.props.allocatedAmount;
  }

  get currency(): string {
    return this.props.currency;
  }

  toProps(): PaymentAllocationProps {
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

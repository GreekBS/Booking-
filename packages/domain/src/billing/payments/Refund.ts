import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../../commerce/shared/value-objects/Money";
import type { RefundStatus } from "./PaymentKinds";
import { assertCompatibleCurrency } from "./Payment";
import { RefundSucceeded } from "./events/PaymentEvents";
import { AggregateRoot } from "../../shared/kernel/Entity";

export interface RefundProps {
  id: string;
  tenantId: string;
  paymentId: string;
  amount: string;
  currency: string;
  status: RefundStatus;
  reason: string | null;
  idempotencyKey: string;
  externalReference: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export class Refund extends AggregateRoot<RefundProps> {
  private constructor(props: RefundProps) {
    super(props);
  }

  static create(input: {
    id: string;
    tenantId: string;
    paymentId: string;
    amount: Money;
    paymentCurrency: string;
    status?: RefundStatus;
    reason?: string | null;
    idempotencyKey: string;
    externalReference?: string | null;
    metadata?: Record<string, unknown>;
    now?: Date;
  }): Refund {
    assertCompatibleCurrency(input.paymentCurrency, input.amount.currency);
    if (toScaled(input.amount.amount) <= 0n) {
      throw new ValidationError("Refund amount must be positive");
    }
    const key = input.idempotencyKey.trim();
    if (!key) {
      throw new ValidationError("idempotencyKey required");
    }
    const now = input.now ?? new Date();
    const status = input.status ?? "PENDING";
    const refund = new Refund({
      id: input.id,
      tenantId: input.tenantId,
      paymentId: input.paymentId,
      amount: input.amount.amount,
      currency: input.amount.currency,
      status,
      reason: input.reason?.trim() || null,
      idempotencyKey: key,
      externalReference: input.externalReference?.trim() || null,
      createdAt: now,
      updatedAt: now,
      metadata: { ...(input.metadata ?? {}) },
    });

    if (status === "SUCCEEDED") {
      refund.addDomainEvent(
        new RefundSucceeded(refund.id, refund.tenantId, {
          paymentId: refund.paymentId,
          amount: refund.amount,
          currency: refund.currency,
        }),
      );
    }

    return refund;
  }

  static rehydrate(props: RefundProps): Refund {
    return new Refund({
      ...props,
      metadata: { ...props.metadata },
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
    });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get paymentId(): string {
    return this.props.paymentId;
  }

  get amount(): string {
    return this.props.amount;
  }

  get currency(): string {
    return this.props.currency;
  }

  get status(): RefundStatus {
    return this.props.status;
  }

  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  toProps(): RefundProps {
    return {
      ...this.props,
      metadata: { ...this.props.metadata },
      createdAt: new Date(this.props.createdAt),
      updatedAt: new Date(this.props.updatedAt),
    };
  }

  markSucceeded(at?: Date): void {
    if (this.props.status !== "PENDING") {
      throw new ValidationError(`Cannot mark refund succeeded from ${this.props.status}`);
    }
    this.props.status = "SUCCEEDED";
    this.props.updatedAt = at ?? new Date();
    this.addDomainEvent(
      new RefundSucceeded(this.id, this.tenantId, {
        paymentId: this.paymentId,
        amount: this.amount,
        currency: this.currency,
      }),
    );
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

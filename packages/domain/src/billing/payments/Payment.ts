import { AggregateRoot } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../../commerce/shared/value-objects/Money";
import type {
  CollectionSource,
  PaymentMethod,
  PaymentStatus,
} from "./PaymentKinds";
import { PaymentRecorded, PaymentSucceeded } from "./events/PaymentEvents";

export interface PaymentProps {
  id: string;
  tenantId: string;
  propertyId: string;
  currency: string;
  amount: string;
  status: PaymentStatus;
  method: PaymentMethod;
  collectionSource: CollectionSource;
  externalReference: string | null;
  payerName: string | null;
  bookingId: string | null;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function isSettleable(status: PaymentStatus): boolean {
  return status === "SUCCEEDED";
}

export function assertCompatibleCurrency(paymentCurrency: string, otherCurrency: string): void {
  const a = paymentCurrency.trim().toUpperCase();
  const b = otherCurrency.trim().toUpperCase();
  if (a !== b) {
    throw new ValidationError("Payment currency mismatch");
  }
}

export class Payment extends AggregateRoot<PaymentProps> {
  private constructor(props: PaymentProps) {
    super(props);
  }

  static create(input: {
    id: string;
    tenantId: string;
    propertyId: string;
    currency: string;
    amount: Money;
    status?: PaymentStatus;
    method: PaymentMethod;
    collectionSource: CollectionSource;
    externalReference?: string | null;
    payerName?: string | null;
    bookingId?: string | null;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
    receivedAt?: Date;
    now?: Date;
    /** When creating already SUCCEEDED, distinct id for PaymentSucceeded delivery key. */
    succeededEventDeliveryResourceId?: string;
  }): Payment {
    const currency = input.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new ValidationError(`Invalid currency: ${input.currency}`);
    }
    const propertyId = input.propertyId.trim();
    if (!propertyId) {
      throw new ValidationError("propertyId required");
    }
    const amount = Money.create(input.amount.amount, currency);
    if (toScaled(amount.amount) <= 0n) {
      throw new ValidationError("Payment amount must be positive");
    }
    const key = input.idempotencyKey.trim();
    if (!key) {
      throw new ValidationError("idempotencyKey required");
    }
    const now = input.now ?? new Date();
    const status = input.status ?? "PENDING";

    const payment = new Payment({
      id: input.id,
      tenantId: input.tenantId,
      propertyId,
      currency,
      amount: amount.amount,
      status,
      method: input.method,
      collectionSource: input.collectionSource,
      externalReference: input.externalReference?.trim() || null,
      payerName: input.payerName?.trim() || null,
      bookingId: input.bookingId ?? null,
      idempotencyKey: key,
      metadata: { ...(input.metadata ?? {}) },
      receivedAt: input.receivedAt ?? now,
      createdAt: now,
      updatedAt: now,
    });

    payment.addDomainEvent(
      new PaymentRecorded(payment.id, payment.tenantId, {
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        collectionSource: payment.collectionSource,
        propertyId: payment.propertyId,
        bookingId: payment.bookingId,
      }),
    );

    if (status === "SUCCEEDED") {
      const deliveryId = input.succeededEventDeliveryResourceId ?? input.id;
      payment.addDomainEvent(
        new PaymentSucceeded(payment.id, payment.tenantId, {
          amount: payment.amount,
          currency: payment.currency,
          propertyId: payment.propertyId,
        }, deliveryId),
      );
    }

    return payment;
  }

  static rehydrate(props: PaymentProps): Payment {
    return new Payment({
      ...props,
      currency: props.currency.trim().toUpperCase(),
      metadata: { ...props.metadata },
      receivedAt: new Date(props.receivedAt),
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
    });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get propertyId(): string {
    return this.props.propertyId;
  }

  get currency(): string {
    return this.props.currency;
  }

  get amount(): string {
    return this.props.amount;
  }

  get status(): PaymentStatus {
    return this.props.status;
  }

  get method(): PaymentMethod {
    return this.props.method;
  }

  get collectionSource(): CollectionSource {
    return this.props.collectionSource;
  }

  get externalReference(): string | null {
    return this.props.externalReference;
  }

  get payerName(): string | null {
    return this.props.payerName;
  }

  get bookingId(): string | null {
    return this.props.bookingId;
  }

  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  get metadata(): Record<string, unknown> {
    return { ...this.props.metadata };
  }

  get receivedAt(): Date {
    return this.props.receivedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  money(): Money {
    return Money.create(this.props.amount, this.props.currency);
  }

  toProps(): PaymentProps {
    return {
      ...this.props,
      metadata: { ...this.props.metadata },
      receivedAt: new Date(this.props.receivedAt),
      createdAt: new Date(this.props.createdAt),
      updatedAt: new Date(this.props.updatedAt),
    };
  }

  assertSettleableForAllocation(): void {
    if (!isSettleable(this.props.status)) {
      throw new ValidationError("Only SUCCEEDED payments can be allocated");
    }
  }

  assertSettleableForRefund(): void {
    if (!isSettleable(this.props.status)) {
      throw new ValidationError("Only SUCCEEDED payments can be refunded");
    }
  }

  markSucceeded(deliveryResourceId: string, at?: Date): void {
    if (this.props.status !== "PENDING") {
      throw new ValidationError(`Cannot markSucceeded from ${this.props.status}`);
    }
    this.props.status = "SUCCEEDED";
    this.props.updatedAt = at ?? new Date();
    this.addDomainEvent(
      new PaymentSucceeded(
        this.id,
        this.tenantId,
        { amount: this.amount, currency: this.currency },
        deliveryResourceId,
      ),
    );
  }

  markFailed(at?: Date): void {
    if (this.props.status !== "PENDING") {
      throw new ValidationError(`Cannot markFailed from ${this.props.status}`);
    }
    this.props.status = "FAILED";
    this.props.updatedAt = at ?? new Date();
  }

  markCancelled(at?: Date): void {
    if (this.props.status !== "PENDING") {
      throw new ValidationError(`Cannot markCancelled from ${this.props.status}`);
    }
    this.props.status = "CANCELLED";
    this.props.updatedAt = at ?? new Date();
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

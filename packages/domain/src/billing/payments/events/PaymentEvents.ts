import { BaseDomainEvent } from "../../../shared/kernel/DomainEvent";

/** Stable 64-char outbox delivery key from tenant + resource UUIDs (hex only). */
export function paymentEventDeliveryKey(tenantId: string, resourceId: string): string {
  return `${tenantId.replace(/-/g, "")}${resourceId.replace(/-/g, "")}`.slice(0, 64);
}

export class PaymentRecorded extends BaseDomainEvent {
  constructor(
    paymentId: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ) {
    super(
      "PaymentRecorded",
      "Payment",
      paymentId,
      tenantId,
      payload,
      paymentEventDeliveryKey(tenantId, paymentId),
    );
  }
}

export class PaymentSucceeded extends BaseDomainEvent {
  constructor(
    paymentId: string,
    tenantId: string,
    payload: Record<string, unknown>,
    /** Distinct id for delivery key when PaymentRecorded already used the payment id. */
    deliveryResourceId: string,
  ) {
    super(
      "PaymentSucceeded",
      "Payment",
      paymentId,
      tenantId,
      payload,
      paymentEventDeliveryKey(tenantId, deliveryResourceId),
    );
  }
}

export class PaymentAllocated extends BaseDomainEvent {
  constructor(
    allocationId: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ) {
    super(
      "PaymentAllocated",
      "PaymentAllocation",
      allocationId,
      tenantId,
      payload,
      paymentEventDeliveryKey(tenantId, allocationId),
    );
  }
}

export class PaymentAllocationReversed extends BaseDomainEvent {
  constructor(
    reversalId: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ) {
    super(
      "PaymentAllocationReversed",
      "PaymentAllocationReversal",
      reversalId,
      tenantId,
      payload,
      paymentEventDeliveryKey(tenantId, reversalId),
    );
  }
}

export class RefundSucceeded extends BaseDomainEvent {
  constructor(
    refundId: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ) {
    super(
      "RefundSucceeded",
      "Refund",
      refundId,
      tenantId,
      payload,
      paymentEventDeliveryKey(tenantId, refundId),
    );
  }
}

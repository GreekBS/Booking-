export interface DomainEvent {
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly tenantId: string | null;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
  /** Optional idempotent delivery identity (P1-S6a outbox). */
  readonly deliveryKey?: string | null;
}

export abstract class BaseDomainEvent implements DomainEvent {
  readonly occurredAt: Date;
  readonly deliveryKey: string | null;

  constructor(
    readonly eventType: string,
    readonly aggregateType: string,
    readonly aggregateId: string,
    readonly tenantId: string | null,
    readonly payload: Record<string, unknown>,
    deliveryKey: string | null = null,
  ) {
    this.occurredAt = new Date();
    this.deliveryKey = deliveryKey;
  }
}

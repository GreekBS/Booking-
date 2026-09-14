import { BaseDomainEvent } from "../../../../shared/kernel/DomainEvent";

export class HoldCreatedEvent extends BaseDomainEvent {
  constructor(
    holdId: string,
    tenantId: string,
    payload: {
      unitId: string;
      propertyId: string;
      checkIn: string;
      checkOut: string;
      expiresAt: string;
    },
  ) {
    super("HoldCreated", "Hold", holdId, tenantId, payload);
  }
}

export class HoldReleasedEvent extends BaseDomainEvent {
  constructor(holdId: string, tenantId: string) {
    super("HoldReleased", "Hold", holdId, tenantId, {});
  }
}

export class HoldExpiredEvent extends BaseDomainEvent {
  constructor(holdId: string, tenantId: string) {
    super("HoldExpired", "Hold", holdId, tenantId, {});
  }
}

export class QuoteCreatedEvent extends BaseDomainEvent {
  constructor(
    quoteId: string,
    tenantId: string,
    payload: {
      holdId: string;
      unitId: string;
      propertyId: string;
      totalAmount: string;
      currency: string;
    },
  ) {
    super("QuoteCreated", "Quote", quoteId, tenantId, payload);
  }
}

export class BookingCreatedEvent extends BaseDomainEvent {
  constructor(
    bookingId: string,
    tenantId: string,
    payload: {
      unitId: string;
      propertyId: string;
      holdId: string;
      quoteId: string;
      quoteSnapshotId: string;
    },
  ) {
    super("BookingCreated", "Booking", bookingId, tenantId, payload);
  }
}

export class BookingConfirmedEvent extends BaseDomainEvent {
  constructor(bookingId: string, tenantId: string) {
    super("BookingConfirmed", "Booking", bookingId, tenantId, {});
  }
}

export class BookingCancelledEvent extends BaseDomainEvent {
  constructor(
    bookingId: string,
    tenantId: string,
    payload: { reason?: string },
  ) {
    super("BookingCancelled", "Booking", bookingId, tenantId, payload);
  }
}

export interface StayChangeEventPayload {
  before: Record<string, string | number>;
  after: Record<string, string | number>;
  quoteId: string;
  previousQuoteId: string;
}

export class BookingStayChangedEvent extends BaseDomainEvent {
  constructor(bookingId: string, tenantId: string, payload: StayChangeEventPayload) {
    super("BookingStayChanged", "Booking", bookingId, tenantId, payload as unknown as Record<string, unknown>);
  }
}

export class BookingUnitChangedEvent extends BaseDomainEvent {
  constructor(bookingId: string, tenantId: string, payload: StayChangeEventPayload) {
    super("BookingUnitChanged", "Booking", bookingId, tenantId, payload as unknown as Record<string, unknown>);
  }
}

export class BookingGuestCountChangedEvent extends BaseDomainEvent {
  constructor(bookingId: string, tenantId: string, payload: StayChangeEventPayload) {
    super("BookingGuestCountChanged", "Booking", bookingId, tenantId, payload as unknown as Record<string, unknown>);
  }
}

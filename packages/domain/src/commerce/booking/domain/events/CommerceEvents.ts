import { BaseDomainEvent } from "../../../../shared/kernel/DomainEvent";
import {
  mutationOriginToPayload,
  type MutationOrigin,
} from "../../../../shared/types/MutationOrigin";

function originPayload(origin?: MutationOrigin | null): Record<string, unknown> {
  return { mutationOrigin: mutationOriginToPayload(origin ?? null) };
}

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
      mutationOrigin?: MutationOrigin | null;
    },
  ) {
    super("HoldCreated", "Hold", holdId, tenantId, {
      unitId: payload.unitId,
      propertyId: payload.propertyId,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      expiresAt: payload.expiresAt,
      ...originPayload(payload.mutationOrigin),
    });
  }
}

export class HoldReleasedEvent extends BaseDomainEvent {
  constructor(
    holdId: string,
    tenantId: string,
    payload: {
      unitId: string;
      propertyId: string;
      checkIn: string;
      checkOut: string;
      mutationOrigin?: MutationOrigin | null;
    } = {
      unitId: "",
      propertyId: "",
      checkIn: "",
      checkOut: "",
    },
  ) {
    super("HoldReleased", "Hold", holdId, tenantId, {
      unitId: payload.unitId,
      propertyId: payload.propertyId,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      ...originPayload(payload.mutationOrigin),
    });
  }
}

export class HoldExpiredEvent extends BaseDomainEvent {
  constructor(
    holdId: string,
    tenantId: string,
    payload: {
      unitId: string;
      propertyId: string;
      checkIn: string;
      checkOut: string;
      mutationOrigin?: MutationOrigin | null;
    } = {
      unitId: "",
      propertyId: "",
      checkIn: "",
      checkOut: "",
    },
  ) {
    super("HoldExpired", "Hold", holdId, tenantId, {
      unitId: payload.unitId,
      propertyId: payload.propertyId,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      ...originPayload(payload.mutationOrigin),
    });
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
      checkIn: string;
      checkOut: string;
      mutationOrigin?: MutationOrigin | null;
    },
  ) {
    super("BookingCreated", "Booking", bookingId, tenantId, {
      unitId: payload.unitId,
      propertyId: payload.propertyId,
      holdId: payload.holdId,
      quoteId: payload.quoteId,
      quoteSnapshotId: payload.quoteSnapshotId,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      ...originPayload(payload.mutationOrigin),
    });
  }
}

export class BookingConfirmedEvent extends BaseDomainEvent {
  constructor(
    bookingId: string,
    tenantId: string,
    payload: {
      unitId: string;
      propertyId: string;
      checkIn: string;
      checkOut: string;
      mutationOrigin?: MutationOrigin | null;
    } = {
      unitId: "",
      propertyId: "",
      checkIn: "",
      checkOut: "",
    },
  ) {
    super("BookingConfirmed", "Booking", bookingId, tenantId, {
      unitId: payload.unitId,
      propertyId: payload.propertyId,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      ...originPayload(payload.mutationOrigin),
    });
  }
}

export class BookingCancelledEvent extends BaseDomainEvent {
  constructor(
    bookingId: string,
    tenantId: string,
    payload: {
      reason?: string;
      unitId: string;
      propertyId: string;
      checkIn: string;
      checkOut: string;
      mutationOrigin?: MutationOrigin | null;
    },
  ) {
    super("BookingCancelled", "Booking", bookingId, tenantId, {
      reason: payload.reason,
      unitId: payload.unitId,
      propertyId: payload.propertyId,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      ...originPayload(payload.mutationOrigin),
    });
  }
}

export interface StayChangeEventPayload {
  before: Record<string, string | number>;
  after: Record<string, string | number>;
  quoteId: string;
  previousQuoteId: string;
  mutationOrigin?: MutationOrigin | null;
}

export class BookingStayChangedEvent extends BaseDomainEvent {
  constructor(bookingId: string, tenantId: string, payload: StayChangeEventPayload) {
    super("BookingStayChanged", "Booking", bookingId, tenantId, {
      before: payload.before,
      after: payload.after,
      quoteId: payload.quoteId,
      previousQuoteId: payload.previousQuoteId,
      ...originPayload(payload.mutationOrigin),
    } as unknown as Record<string, unknown>);
  }
}

export class BookingUnitChangedEvent extends BaseDomainEvent {
  constructor(bookingId: string, tenantId: string, payload: StayChangeEventPayload) {
    super("BookingUnitChanged", "Booking", bookingId, tenantId, {
      before: payload.before,
      after: payload.after,
      quoteId: payload.quoteId,
      previousQuoteId: payload.previousQuoteId,
      ...originPayload(payload.mutationOrigin),
    } as unknown as Record<string, unknown>);
  }
}

export class BookingGuestCountChangedEvent extends BaseDomainEvent {
  constructor(bookingId: string, tenantId: string, payload: StayChangeEventPayload) {
    super("BookingGuestCountChanged", "Booking", bookingId, tenantId, {
      before: payload.before,
      after: payload.after,
      quoteId: payload.quoteId,
      previousQuoteId: payload.previousQuoteId,
      ...originPayload(payload.mutationOrigin),
    } as unknown as Record<string, unknown>);
  }
}

import { AggregateRoot } from "../../../shared/kernel/Entity";
import { ConflictError, ValidationError } from "../../../shared/errors/DomainError";
import type { BookingStatus, ConfirmationMode, GuestDetailsProps } from "../../shared/types/CommerceTypes";
import { StayPeriod } from "../../shared/value-objects/StayPeriod";
import { GuestCount } from "../../shared/value-objects/GuestCount";
import type { Hold } from "./Hold";
import type { Quote } from "./Quote";
import { BookingStateMachine } from "./BookingStateMachine";
import type { ApplyStayChangeCommand } from "../../reservation/types";
import type { MutationOrigin } from "../../../shared/types/MutationOrigin";
import {
  BookingCancelledEvent,
  BookingConfirmedEvent,
  BookingCreatedEvent,
  BookingGuestCountChangedEvent,
  BookingStayChangedEvent,
  BookingSupersededEvent,
  BookingUnitChangedEvent,
  type StayChangeEventPayload,
} from "./events/CommerceEvents";

export interface BookingProps {
  id: string;
  tenantId: string;
  unitId: string;
  propertyId: string;
  holdId: string;
  quoteId: string;
  quoteSnapshotId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  guest: GuestDetailsProps;
  /** CRM Guest identity (nullable until linked). */
  guestId: string | null;
  status: BookingStatus;
  confirmationMode: ConfirmationMode;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
  /**
   * Import supersede metadata (domain only in A0 — persistence is Phase A).
   * Optional on reconstitute so existing DB mappers compile without schema columns.
   */
  supersededByBookingId?: string | null;
  supersededAt?: Date | null;
  supersedeReason?: string | null;
}

export interface SupersedeForImportProps {
  supersededByBookingId: string;
  reason?: string | null;
  at?: Date;
  mutationOrigin?: MutationOrigin | null;
}

export interface CreateBookingProps {
  id: string;
  hold: Hold;
  quote: Quote;
  guest: GuestDetailsProps;
  confirmationMode: ConfirmationMode;
  /** CRM Guest id — set by booking create flows after ResolveOrCreateGuest. */
  guestId?: string | null;
  now?: Date;
  mutationOrigin?: MutationOrigin | null;
}

export class Booking extends AggregateRoot<BookingProps> {
  private constructor(props: BookingProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get unitId(): string {
    return this.props.unitId;
  }

  get propertyId(): string {
    return this.props.propertyId;
  }

  get holdId(): string {
    return this.props.holdId;
  }

  get quoteId(): string {
    return this.props.quoteId;
  }

  get quoteSnapshotId(): string {
    return this.props.quoteSnapshotId;
  }

  get stayPeriod(): StayPeriod {
    return StayPeriod.create(this.props.checkIn, this.props.checkOut);
  }

  get guestCount(): GuestCount {
    return GuestCount.create(this.props.guestCount);
  }

  get guest(): GuestDetailsProps {
    return { ...this.props.guest };
  }

  get guestId(): string | null {
    return this.props.guestId;
  }

  get status(): BookingStatus {
    return this.props.status;
  }

  get confirmationMode(): ConfirmationMode {
    return this.props.confirmationMode;
  }

  get supersededByBookingId(): string | null {
    return this.props.supersededByBookingId ?? null;
  }

  get supersededAt(): Date | null {
    return this.props.supersededAt ?? null;
  }

  get supersedeReason(): string | null {
    return this.props.supersedeReason ?? null;
  }

  get isSuperseded(): boolean {
    return this.supersededByBookingId != null && this.supersededAt != null;
  }

  /**
   * Persistence contract: when true, the booking calendar block must become non-active
   * in the same transaction that persists supersede metadata (Phase A/D).
   */
  get requiresCalendarOccupancyRelease(): boolean {
    return this.isSuperseded;
  }

  get confirmedAt(): Date | null {
    return this.props.confirmedAt;
  }

  get cancelledAt(): Date | null {
    return this.props.cancelledAt;
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(props: CreateBookingProps): Booking {
    const now = props.now ?? new Date();
    const { hold, quote } = props;

    if (hold.id !== quote.holdId) {
      throw new ValidationError("Quote does not belong to hold");
    }

    hold.assertValidForQuote(now);
    quote.assertValidForBooking(now);
    validateGuest(props.guest);

    const status = BookingStateMachine.initialStatus(props.confirmationMode);

    const booking = new Booking({
      id: props.id,
      tenantId: hold.tenantId,
      unitId: hold.unitId,
      propertyId: hold.propertyId,
      holdId: hold.id,
      quoteId: quote.id,
      quoteSnapshotId: quote.snapshotId,
      checkIn: hold.stayPeriod.checkIn.value,
      checkOut: hold.stayPeriod.checkOut.value,
      guestCount: hold.guestCount.value,
      guest: { ...props.guest },
      guestId: props.guestId ?? null,
      status,
      confirmationMode: props.confirmationMode,
      createdAt: now,
      updatedAt: now,
      confirmedAt: null,
      cancelledAt: null,
      completedAt: null,
      supersededByBookingId: null,
      supersededAt: null,
      supersedeReason: null,
    });

    booking.addDomainEvent(
      new BookingCreatedEvent(booking.id, booking.tenantId, {
        unitId: booking.unitId,
        propertyId: booking.propertyId,
        holdId: booking.holdId,
        quoteId: booking.quoteId,
        quoteSnapshotId: booking.quoteSnapshotId,
        checkIn: booking.props.checkIn,
        checkOut: booking.props.checkOut,
        mutationOrigin: props.mutationOrigin ?? null,
      }),
    );

    hold.markConverted(now);

    return booking;
  }

  static reconstitute(props: BookingProps): Booking {
    return new Booking({
      ...props,
      guestId: props.guestId ?? null,
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
      confirmedAt: props.confirmedAt ? new Date(props.confirmedAt) : null,
      cancelledAt: props.cancelledAt ? new Date(props.cancelledAt) : null,
      completedAt: props.completedAt ? new Date(props.completedAt) : null,
      supersededByBookingId: props.supersededByBookingId ?? null,
      supersededAt: props.supersededAt ? new Date(props.supersededAt) : null,
      supersedeReason: props.supersedeReason ?? null,
    });
  }

  /**
   * Link CRM Guest before first persistence. Does not alter reservation contact snapshot.
   * Idempotent when the same guestId is assigned again.
   */
  linkGuest(guestId: string): void {
    const id = guestId.trim();
    if (!id) {
      throw new ValidationError("guestId required");
    }
    if (this.props.guestId && this.props.guestId !== id) {
      throw new ConflictError("Booking already linked to a different Guest");
    }
    this.props.guestId = id;
    this.props.updatedAt = new Date();
  }

  requestPayment(at: Date = new Date()): void {
    BookingStateMachine.assertNotTerminal(this.props.status);
    if (this.props.confirmationMode !== "payment_required") {
      throw new ValidationError("Payment is not required for this booking");
    }
    this.transitionTo("payment_pending", at);
  }

  confirm(at: Date = new Date(), mutationOrigin?: MutationOrigin | null): void {
    BookingStateMachine.assertNotTerminal(this.props.status);
    BookingStateMachine.assertCanConfirm(this.props.status, this.props.confirmationMode);

    this.transitionTo("confirmed", at);
    this.props.confirmedAt = at;
    this.addDomainEvent(
      new BookingConfirmedEvent(this.id, this.tenantId, {
        unitId: this.unitId,
        propertyId: this.propertyId,
        checkIn: this.props.checkIn,
        checkOut: this.props.checkOut,
        mutationOrigin: mutationOrigin ?? null,
      }),
    );
  }

  cancel(
    reason?: string,
    at: Date = new Date(),
    mutationOrigin?: MutationOrigin | null,
  ): void {
    BookingStateMachine.assertNotTerminal(this.props.status);
    if (this.props.status === "confirmed" || this.props.status === "payment_pending" || this.props.status === "pending") {
      this.transitionTo("cancelled", at);
      this.props.cancelledAt = at;
      this.addDomainEvent(
        new BookingCancelledEvent(this.id, this.tenantId, {
          reason,
          unitId: this.unitId,
          propertyId: this.propertyId,
          checkIn: this.props.checkIn,
          checkOut: this.props.checkOut,
          mutationOrigin: mutationOrigin ?? null,
        }),
      );
      return;
    }
    throw new ConflictError(`Cannot cancel booking in status ${this.props.status}`);
  }

  complete(at: Date = new Date()): void {
    if (this.props.status !== "confirmed") {
      throw new ConflictError("Only confirmed bookings can be completed");
    }
    this.transitionTo("completed", at);
    this.props.completedAt = at;
  }

  /**
   * Import-safe historical lifecycle step: confirm (if pending) then complete.
   * Reuses existing state transitions — does not reopen or rewrite stay/price.
   */
  finalizeAsHistoricalImport(
    at: Date = new Date(),
    mutationOrigin?: MutationOrigin | null,
  ): void {
    if (this.props.status === "pending") {
      this.confirm(at, mutationOrigin);
    }
    if (this.props.status === "confirmed") {
      this.complete(at);
      return;
    }
    if (this.props.status === "completed") {
      return;
    }
    throw new ConflictError(
      `Cannot finalize historical import booking in status ${this.props.status}`,
    );
  }

  /**
   * Supersede a completed booking for import replacement.
   * Does not cancel, hard-delete, or alter stay/guest/quote.
   * Emits BookingSupersededEvent — calendar occupancy release is a persistence concern.
   */
  supersedeForImport(props: SupersedeForImportProps): void {
    if (this.props.status !== "completed") {
      throw new ConflictError(
        `Only completed bookings can be superseded for import (status: ${this.props.status})`,
      );
    }
    if (this.isSuperseded) {
      throw new ConflictError("Booking has already been superseded");
    }

    const successorId = props.supersededByBookingId.trim();
    if (!successorId) {
      throw new ValidationError("supersededByBookingId is required");
    }
    if (successorId === this.id) {
      throw new ValidationError("Booking cannot supersede itself");
    }

    const at = props.at ?? new Date();
    const reason = props.reason?.trim() ? props.reason.trim() : null;

    this.props.supersededByBookingId = successorId;
    this.props.supersededAt = at;
    this.props.supersedeReason = reason;
    this.props.updatedAt = at;

    this.addDomainEvent(
      new BookingSupersededEvent(this.id, this.tenantId, {
        supersededByBookingId: successorId,
        unitId: this.unitId,
        propertyId: this.propertyId,
        checkIn: this.props.checkIn,
        checkOut: this.props.checkOut,
        supersedeReason: reason,
        releaseBookingCalendarOccupancy: true,
        mutationOrigin: props.mutationOrigin ?? null,
      }),
    );
  }

  applyStayChange(
    command: ApplyStayChangeCommand,
    quote: Quote,
    at: Date = new Date(),
    mutationOrigin?: MutationOrigin | null,
  ): void {
    BookingStateMachine.assertNotTerminal(this.props.status);

    if (quote.tenantId !== this.props.tenantId) {
      throw new ValidationError("Quote tenant mismatch");
    }
    if (quote.unitId !== command.unitId) {
      throw new ValidationError("Quote unit mismatch");
    }
    if (quote.snapshot.checkIn !== command.checkIn || quote.snapshot.checkOut !== command.checkOut) {
      throw new ValidationError("Quote stay dates mismatch");
    }

    quote.assertValidForBooking(at);

    const previousQuoteId = this.props.quoteId;
    const before = {
      unitId: this.props.unitId,
      propertyId: this.props.propertyId,
      checkIn: this.props.checkIn,
      checkOut: this.props.checkOut,
      guestCount: this.props.guestCount,
    };

    this.props.unitId = command.unitId;
    this.props.propertyId = command.propertyId;
    this.props.checkIn = command.checkIn;
    this.props.checkOut = command.checkOut;
    this.props.guestCount = command.guestCount;
    this.props.quoteId = quote.id;
    this.props.quoteSnapshotId = quote.snapshotId;
    this.props.updatedAt = at;

    const eventBase: Omit<StayChangeEventPayload, "before" | "after"> = {
      quoteId: quote.id,
      previousQuoteId,
      mutationOrigin: mutationOrigin ?? null,
    };

    if (before.checkIn !== command.checkIn || before.checkOut !== command.checkOut) {
      this.addDomainEvent(
        new BookingStayChangedEvent(this.id, this.tenantId, {
          ...eventBase,
          before: { checkIn: before.checkIn, checkOut: before.checkOut },
          after: { checkIn: command.checkIn, checkOut: command.checkOut },
        }),
      );
    }

    if (before.unitId !== command.unitId || before.propertyId !== command.propertyId) {
      this.addDomainEvent(
        new BookingUnitChangedEvent(this.id, this.tenantId, {
          ...eventBase,
          before: { unitId: before.unitId, propertyId: before.propertyId },
          after: { unitId: command.unitId, propertyId: command.propertyId },
        }),
      );
    }

    if (before.guestCount !== command.guestCount) {
      this.addDomainEvent(
        new BookingGuestCountChangedEvent(this.id, this.tenantId, {
          ...eventBase,
          before: { guestCount: before.guestCount },
          after: { guestCount: command.guestCount },
        }),
      );
    }
  }

  private transitionTo(status: BookingStatus, at: Date): void {
    BookingStateMachine.assertCanTransition(this.props.status, status);
    this.props.status = status;
    this.props.updatedAt = at;
  }
}

function validateGuest(guest: GuestDetailsProps): void {
  if (!guest.name.trim()) {
    throw new ValidationError("Guest name is required");
  }
  if (!guest.email.trim()) {
    throw new ValidationError("Guest email is required");
  }
}

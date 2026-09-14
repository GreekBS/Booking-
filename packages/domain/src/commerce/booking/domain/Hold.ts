import { AggregateRoot } from "../../../shared/kernel/Entity";
import { ConflictError, ValidationError } from "../../../shared/errors/DomainError";
import { StayPeriod } from "../../shared/value-objects/StayPeriod";
import { GuestCount } from "../../shared/value-objects/GuestCount";
import type { HoldStatus } from "../../shared/types/CommerceTypes";
import { DEFAULT_HOLD_TTL_SECONDS } from "../../shared/types/CommerceTypes";
import { HoldStateMachine } from "./BookingStateMachine";
import {
  HoldCreatedEvent,
  HoldExpiredEvent,
  HoldReleasedEvent,
} from "./events/CommerceEvents";

export interface HoldProps {
  id: string;
  tenantId: string;
  unitId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  status: HoldStatus;
  sessionRef: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateHoldProps {
  id: string;
  tenantId: string;
  unitId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  sessionRef?: string | null;
  ttlSeconds?: number;
  now?: Date;
}

export class Hold extends AggregateRoot<HoldProps> {
  private constructor(props: HoldProps) {
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

  get stayPeriod(): StayPeriod {
    return StayPeriod.create(this.props.checkIn, this.props.checkOut);
  }

  get guestCount(): GuestCount {
    return GuestCount.create(this.props.guestCount);
  }

  get status(): HoldStatus {
    return this.props.status;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get sessionRef(): string | null {
    return this.props.sessionRef;
  }

  static create(props: CreateHoldProps): Hold {
    const now = props.now ?? new Date();
    const stayPeriod = StayPeriod.create(props.checkIn, props.checkOut);
    GuestCount.create(props.guestCount);

    const ttlSeconds = props.ttlSeconds ?? DEFAULT_HOLD_TTL_SECONDS;
    if (ttlSeconds <= 0) {
      throw new ValidationError("Hold TTL must be positive");
    }

    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const hold = new Hold({
      id: props.id,
      tenantId: props.tenantId,
      unitId: props.unitId,
      propertyId: props.propertyId,
      checkIn: stayPeriod.checkIn.value,
      checkOut: stayPeriod.checkOut.value,
      guestCount: props.guestCount,
      status: "active",
      sessionRef: props.sessionRef ?? null,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    hold.addDomainEvent(
      new HoldCreatedEvent(hold.id, hold.tenantId, {
        unitId: hold.unitId,
        propertyId: hold.propertyId,
        checkIn: hold.props.checkIn,
        checkOut: hold.props.checkOut,
        expiresAt: hold.expiresAt.toISOString(),
      }),
    );

    return hold;
  }

  static reconstitute(props: HoldProps): Hold {
    return new Hold({
      ...props,
      expiresAt: new Date(props.expiresAt),
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
    });
  }

  isExpired(at: Date = new Date()): boolean {
    return at.getTime() >= this.props.expiresAt.getTime();
  }

  assertValidForQuote(at: Date = new Date()): void {
    HoldStateMachine.assertActive(this.props.status);
    if (this.isExpired(at)) {
      throw new ConflictError("Hold has expired");
    }
  }

  release(at: Date = new Date()): void {
    HoldStateMachine.assertActive(this.props.status);
    this.transitionTo("released", at);
    this.addDomainEvent(new HoldReleasedEvent(this.id, this.tenantId));
  }

  expire(at: Date = new Date()): void {
    HoldStateMachine.assertActive(this.props.status);
    if (!this.isExpired(at)) {
      throw new ConflictError("Hold has not yet expired");
    }
    this.transitionTo("expired", at);
    this.addDomainEvent(new HoldExpiredEvent(this.id, this.tenantId));
  }

  markConverted(at: Date = new Date()): void {
    HoldStateMachine.assertActive(this.props.status);
    this.transitionTo("converted", at);
  }

  private transitionTo(status: HoldStatus, at: Date): void {
    HoldStateMachine.assertCanTransition(this.props.status, status);
    this.props.status = status;
    this.props.updatedAt = at;
  }
}

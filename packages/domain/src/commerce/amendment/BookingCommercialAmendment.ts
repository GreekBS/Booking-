import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../shared/value-objects/Money";
import type { BookingPricingIntent } from "../shared/types/CommerceTypes";
import type { MutationOriginKind } from "../../shared/types/MutationOrigin";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_PRICING_INTENTS: readonly BookingPricingIntent[] = [
  "recalculate_from_rate_plan",
] as const;

const ALLOWED_MUTATION_ORIGINS: readonly MutationOriginKind[] = [
  "operator",
] as const;

const MIN_REASON = 3;
const MAX_REASON = 500;
const MAX_IDEMPOTENCY_KEY = 64;
const CONFIRMATION_REF_LEN = 64; // sha256 hex
const PRICING_FINGERPRINT_LEN = 64;

export interface BookingCommercialAmendmentProps {
  id: string;
  tenantId: string;
  propertyId: string;
  bookingId: string;
  previousQuoteId: string;
  newQuoteId: string;
  previousTotalAmount: string;
  newTotalAmount: string;
  deltaAmount: string;
  currency: string;
  pricingIntent: BookingPricingIntent;
  reason: string;
  actorId: string;
  mutationOrigin: MutationOriginKind;
  confirmationReference: string;
  idempotencyKey: string;
  pricingFingerprint: string;
  createdAt: Date;
}

export interface CreateBookingCommercialAmendmentInput {
  id: string;
  tenantId: string;
  propertyId: string;
  bookingId: string;
  previousQuoteId: string;
  newQuoteId: string;
  previousTotalAmount: string;
  newTotalAmount: string;
  currency: string;
  pricingIntent: BookingPricingIntent;
  reason: string;
  actorId: string;
  mutationOrigin: MutationOriginKind;
  confirmationReference: string;
  idempotencyKey: string;
  pricingFingerprint: string;
  createdAt?: Date;
}

/**
 * Durable commercial amendment record (BFS-3a).
 * Creation validates invariants only — does not mutate booking/quote/folio.
 */
export class BookingCommercialAmendment {
  private constructor(private readonly props: BookingCommercialAmendmentProps) {}

  static create(
    input: CreateBookingCommercialAmendmentInput,
  ): BookingCommercialAmendment {
    assertUuid("id", input.id);
    assertUuid("tenantId", input.tenantId);
    assertUuid("propertyId", input.propertyId);
    assertUuid("bookingId", input.bookingId);
    assertUuid("previousQuoteId", input.previousQuoteId);
    assertUuid("newQuoteId", input.newQuoteId);
    assertUuid("actorId", input.actorId);

    if (input.previousQuoteId === input.newQuoteId) {
      throw new ValidationError(
        "Commercial amendment requires distinct previous and new quote ids",
      );
    }

    if (!ALLOWED_PRICING_INTENTS.includes(input.pricingIntent)) {
      throw new ValidationError(
        `Unsupported pricing intent for commercial amendment: ${input.pricingIntent}`,
      );
    }

    if (!ALLOWED_MUTATION_ORIGINS.includes(input.mutationOrigin)) {
      throw new ValidationError(
        `Unsupported mutation origin for commercial amendment: ${input.mutationOrigin}`,
      );
    }

    const reason = input.reason.trim();
    if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
      throw new ValidationError(
        `Commercial amendment reason must be ${MIN_REASON}-${MAX_REASON} characters`,
      );
    }

    const idempotencyKey = input.idempotencyKey.trim();
    if (
      idempotencyKey.length < 8 ||
      idempotencyKey.length > MAX_IDEMPOTENCY_KEY
    ) {
      throw new ValidationError(
        `Idempotency key must be 8-${MAX_IDEMPOTENCY_KEY} characters`,
      );
    }

    const confirmationReference = input.confirmationReference.trim().toLowerCase();
    if (
      confirmationReference.length !== CONFIRMATION_REF_LEN ||
      !/^[0-9a-f]+$/.test(confirmationReference)
    ) {
      throw new ValidationError(
        "Confirmation reference must be a 64-char hex digest",
      );
    }

    const pricingFingerprint = input.pricingFingerprint.trim().toLowerCase();
    if (
      pricingFingerprint.length !== PRICING_FINGERPRINT_LEN ||
      !/^[0-9a-f]+$/.test(pricingFingerprint)
    ) {
      throw new ValidationError(
        "Pricing fingerprint must be a 64-char hex digest",
      );
    }

    const previousTotal = Money.create(
      input.previousTotalAmount,
      input.currency,
    );
    const newTotal = Money.create(input.newTotalAmount, input.currency);
    if (previousTotal.isZero() || previousTotal.isNegative()) {
      throw new ValidationError("Previous total must be positive");
    }
    if (newTotal.isZero() || newTotal.isNegative()) {
      throw new ValidationError("New total must be positive");
    }

    const delta = newTotal.subtract(previousTotal);

    return new BookingCommercialAmendment({
      id: input.id,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      bookingId: input.bookingId,
      previousQuoteId: input.previousQuoteId,
      newQuoteId: input.newQuoteId,
      previousTotalAmount: previousTotal.amount,
      newTotalAmount: newTotal.amount,
      deltaAmount: delta.amount,
      currency: previousTotal.currency,
      pricingIntent: input.pricingIntent,
      reason,
      actorId: input.actorId,
      mutationOrigin: input.mutationOrigin,
      confirmationReference,
      idempotencyKey,
      pricingFingerprint,
      createdAt: input.createdAt ?? new Date(),
    });
  }

  static rehydrate(
    props: BookingCommercialAmendmentProps,
  ): BookingCommercialAmendment {
    return new BookingCommercialAmendment({
      ...props,
      createdAt: new Date(props.createdAt),
    });
  }

  /** Exact payload equality for durable idempotency retries. */
  matchesIdempotentPayload(other: BookingCommercialAmendment): boolean {
    return (
      this.props.tenantId === other.props.tenantId &&
      this.props.propertyId === other.props.propertyId &&
      this.props.bookingId === other.props.bookingId &&
      this.props.previousQuoteId === other.props.previousQuoteId &&
      this.props.newQuoteId === other.props.newQuoteId &&
      this.props.previousTotalAmount === other.props.previousTotalAmount &&
      this.props.newTotalAmount === other.props.newTotalAmount &&
      this.props.deltaAmount === other.props.deltaAmount &&
      this.props.currency === other.props.currency &&
      this.props.pricingIntent === other.props.pricingIntent &&
      this.props.reason === other.props.reason &&
      this.props.actorId === other.props.actorId &&
      this.props.mutationOrigin === other.props.mutationOrigin &&
      this.props.confirmationReference === other.props.confirmationReference &&
      this.props.idempotencyKey === other.props.idempotencyKey &&
      this.props.pricingFingerprint === other.props.pricingFingerprint
    );
  }

  toProps(): BookingCommercialAmendmentProps {
    return {
      ...this.props,
      createdAt: new Date(this.props.createdAt),
    };
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get propertyId(): string {
    return this.props.propertyId;
  }
  get bookingId(): string {
    return this.props.bookingId;
  }
  get previousQuoteId(): string {
    return this.props.previousQuoteId;
  }
  get newQuoteId(): string {
    return this.props.newQuoteId;
  }
  get previousTotalAmount(): string {
    return this.props.previousTotalAmount;
  }
  get newTotalAmount(): string {
    return this.props.newTotalAmount;
  }
  get deltaAmount(): string {
    return this.props.deltaAmount;
  }
  get currency(): string {
    return this.props.currency;
  }
  get pricingIntent(): BookingPricingIntent {
    return this.props.pricingIntent;
  }
  get reason(): string {
    return this.props.reason;
  }
  get actorId(): string {
    return this.props.actorId;
  }
  get mutationOrigin(): MutationOriginKind {
    return this.props.mutationOrigin;
  }
  get confirmationReference(): string {
    return this.props.confirmationReference;
  }
  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }
  get pricingFingerprint(): string {
    return this.props.pricingFingerprint;
  }
  get createdAt(): Date {
    return new Date(this.props.createdAt);
  }
}

function assertUuid(field: string, value: string): void {
  if (!UUID_REGEX.test(value)) {
    throw new ValidationError(`Invalid ${field}`);
  }
}

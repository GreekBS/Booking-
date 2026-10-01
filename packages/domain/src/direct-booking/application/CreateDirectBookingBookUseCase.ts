import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { Booking } from "../../commerce/booking/domain/Booking";
import type { Quote } from "../../commerce/booking/domain/Quote";
import type { CreateBookingUseCase } from "../../commerce/application/CommerceUseCases";
import type {
  IBookingRepository,
  IHoldRepository,
  IQuoteRepository,
} from "../../commerce/ports/CommercePorts";
import type { IStorefrontIdempotencyRepository } from "../../storefront/ports/StorefrontPorts";
import type {
  DirectBookingIntegrationPublicLookup,
  IDirectBookingCatalogPort,
} from "../ports/DirectBookingPorts";
import {
  assertDirectBookingBookable,
  assertIntegrationEnabledForPublicAccess,
  evaluateDirectBookingPublishability,
} from "./publishability";
import { createDirectBookingActor } from "./directBookingActor";

const IDEMPOTENCY_SCOPE = "dbk_booking" as const;
const IDEMPOTENCY_LEDGER_TTL_MS = 24 * 60 * 60 * 1000;

export interface CreateDirectBookingBookCommand {
  holdId: string;
  guest: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    country: string;
  };
  acceptedTerms: true;
  idempotencyKey: string;
}

export interface DirectBookingBookDto {
  bookingId: string;
  confirmationCode: string;
  status: "pending" | "payment_pending" | "confirmed" | "cancelled" | "completed";
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number;
  currency: string;
  total: string;
  guestEmail: string;
}

/**
 * Public Direct Booking convert: Hold + Quote → Guest → real Booking (pending).
 * Thin wrapper over CreateBookingUseCase / ResolveOrCreateGuest / saveHoldAndBooking.
 * No payment, no email, no special booking-request status.
 */
export class CreateDirectBookingBookUseCase {
  constructor(
    private readonly catalog: IDirectBookingCatalogPort,
    private readonly holdRepository: IHoldRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly bookingRepository: IBookingRepository,
    private readonly createBooking: CreateBookingUseCase,
    private readonly idempotency: IStorefrontIdempotencyRepository,
  ) {}

  async execute(
    integration: DirectBookingIntegrationPublicLookup,
    command: CreateDirectBookingBookCommand,
  ): Promise<Result<DirectBookingBookDto, Error>> {
    try {
      assertIntegrationEnabledForPublicAccess(integration);

      const snapshot = await this.catalog.getCatalogSnapshot(
        integration.tenantId,
        integration.propertyId,
        integration.unitId,
      );
      if (!snapshot) {
        return Result.fail(new NotFoundError("Property", integration.propertyId));
      }

      const publishability = evaluateDirectBookingPublishability(
        integration,
        snapshot,
        { requireRatePlan: true },
      );
      assertDirectBookingBookable(publishability);

      if (command.acceptedTerms !== true) {
        return Result.fail(new ValidationError("Terms must be accepted"));
      }

      const idempotencyKey = command.idempotencyKey.trim();
      if (idempotencyKey.length < 8 || idempotencyKey.length > 64) {
        return Result.fail(new ValidationError("Invalid idempotency key"));
      }

      const existingBookingId = await this.idempotency.findResourceId(
        integration.tenantId,
        IDEMPOTENCY_SCOPE,
        idempotencyKey,
      );
      if (existingBookingId) {
        return this.replayExisting(integration, command, existingBookingId);
      }

      const hold = await this.holdRepository.findById(
        command.holdId,
        integration.tenantId,
      );
      if (!hold) {
        return Result.fail(new NotFoundError("Hold", command.holdId));
      }

      if (
        hold.tenantId !== integration.tenantId ||
        hold.propertyId !== integration.propertyId ||
        hold.unitId !== integration.unitId
      ) {
        return Result.fail(new ForbiddenError("Hold does not belong to this integration"));
      }

      if (hold.status !== "active" || hold.isExpired()) {
        return Result.fail(new ConflictError("Hold has expired"));
      }

      const quote = await this.quoteRepository.findByHoldId(
        hold.id,
        integration.tenantId,
      );
      if (!quote || quote.holdId !== hold.id) {
        return Result.fail(new ValidationError("Quote not found for hold"));
      }

      if (quote.isExpired()) {
        return Result.fail(new ConflictError("Hold has expired"));
      }

      const displayName = `${command.guest.firstName} ${command.guest.lastName}`.trim();
      const actor = createDirectBookingActor(integration.tenantId);

      const result = await this.createBooking.execute(
        {
          tenantId: integration.tenantId,
          quoteId: quote.id,
          guest: {
            name: displayName,
            email: command.guest.email,
            phone: command.guest.phone,
            firstName: command.guest.firstName,
            lastName: command.guest.lastName,
            country: command.guest.country,
          },
          confirmationMode: "manual",
        },
        actor,
      );

      if (result.isFailure) {
        return Result.fail(result.getError());
      }

      const booking = result.getValue();

      await this.idempotency.save(
        integration.tenantId,
        IDEMPOTENCY_SCOPE,
        idempotencyKey,
        booking.id,
        new Date(Date.now() + IDEMPOTENCY_LEDGER_TTL_MS),
      );

      return Result.ok(mapBookDto(booking, quote));
    } catch (error) {
      if (
        error instanceof ForbiddenError ||
        error instanceof ValidationError ||
        error instanceof NotFoundError ||
        error instanceof ConflictError
      ) {
        return Result.fail(error);
      }
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async replayExisting(
    integration: DirectBookingIntegrationPublicLookup,
    command: CreateDirectBookingBookCommand,
    bookingId: string,
  ): Promise<Result<DirectBookingBookDto, Error>> {
    const booking = await this.bookingRepository.findById(
      bookingId,
      integration.tenantId,
    );
    if (!booking) {
      return Result.fail(new ConflictError("Idempotency key conflict"));
    }

    if (
      booking.tenantId !== integration.tenantId ||
      booking.propertyId !== integration.propertyId ||
      booking.unitId !== integration.unitId
    ) {
      return Result.fail(new ConflictError("Idempotency key conflict"));
    }

    if (booking.holdId !== command.holdId) {
      return Result.fail(
        new ConflictError("Idempotency key reused with different request"),
      );
    }

    const expectedName = `${command.guest.firstName} ${command.guest.lastName}`.trim();
    if (
      booking.guest.email.toLowerCase() !== command.guest.email.trim().toLowerCase() ||
      booking.guest.name.trim() !== expectedName
    ) {
      return Result.fail(
        new ConflictError("Idempotency key reused with different request"),
      );
    }

    const quote = await this.quoteRepository.findById(
      booking.quoteId,
      integration.tenantId,
    );
    if (!quote) {
      return Result.fail(new ConflictError("Idempotency key conflict"));
    }

    return Result.ok(mapBookDto(booking, quote));
  }
}

function mapBookDto(booking: Booking, quote: Quote): DirectBookingBookDto {
  return {
    bookingId: booking.id,
    confirmationCode: `HCP-${booking.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
    status: booking.status,
    checkIn: booking.stayPeriod.checkIn.value,
    checkOut: booking.stayPeriod.checkOut.value,
    nights: booking.stayPeriod.nightCount(),
    guestCount: booking.guestCount.value,
    currency: quote.snapshot.currency,
    total: quote.snapshot.totalAmount,
    guestEmail: booking.guest.email,
  };
}

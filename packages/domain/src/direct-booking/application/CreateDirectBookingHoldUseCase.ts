import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import { mutationOriginDirect } from "../../shared/types/MutationOrigin";
import { DEFAULT_HOLD_TTL_SECONDS } from "../../commerce/shared/types/CommerceTypes";
import type { Hold } from "../../commerce/booking/domain/Hold";
import type { Quote } from "../../commerce/booking/domain/Quote";
import type { ReservationOrchestrator } from "../../commerce/reservation/ReservationOrchestrator";
import type {
  ICommerceFlowRepository,
  ICommerceSettingsRepository,
  IHoldRepository,
  IQuoteRepository,
} from "../../commerce/ports/CommercePorts";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
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

const IDEMPOTENCY_SCOPE = "dbk_hold" as const;
const IDEMPOTENCY_LEDGER_TTL_MS = 24 * 60 * 60 * 1000;

export interface CreateDirectBookingHoldCommand {
  checkIn: string;
  checkOut: string;
  guestCount: number;
  idempotencyKey: string;
}

export interface DirectBookingHoldDto {
  holdId: string;
  quoteId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  expiresAt: string;
  currency: string;
  total: string;
  status: "active";
}

/**
 * Public Direct Booking Hold + persisted Quote (price lock).
 * Reuses ReservationOrchestrator + calendar exclusion + ExpireHolds-compatible Hold shape.
 * Does NOT create Guest or Booking.
 */
export class CreateDirectBookingHoldUseCase {
  constructor(
    private readonly catalog: IDirectBookingCatalogPort,
    private readonly orchestrator: ReservationOrchestrator,
    private readonly commerceSettings: ICommerceSettingsRepository,
    private readonly holdRepository: IHoldRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly commerceFlow: ICommerceFlowRepository,
    private readonly idempotency: IStorefrontIdempotencyRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    integration: DirectBookingIntegrationPublicLookup,
    command: CreateDirectBookingHoldCommand,
  ): Promise<Result<DirectBookingHoldDto, Error>> {
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

      if (
        !Number.isInteger(command.guestCount) ||
        command.guestCount < 1 ||
        command.guestCount > snapshot.unit.maxGuests
      ) {
        return Result.fail(new ValidationError("Guest count exceeds unit limit"));
      }

      const idempotencyKey = command.idempotencyKey.trim();
      if (idempotencyKey.length < 8 || idempotencyKey.length > 64) {
        return Result.fail(new ValidationError("Invalid idempotency key"));
      }

      const existingHoldId = await this.idempotency.findResourceId(
        integration.tenantId,
        IDEMPOTENCY_SCOPE,
        idempotencyKey,
      );
      if (existingHoldId) {
        return this.replayExisting(integration, command, existingHoldId);
      }

      const bySession = await this.holdRepository.findByIdempotencyKey(
        integration.tenantId,
        idempotencyKey,
      );
      if (bySession) {
        return this.replayExisting(integration, command, bySession.id);
      }

      const settings = await this.commerceSettings.findByTenantId(integration.tenantId);
      const ttlSeconds = settings?.defaultHoldTtlSeconds ?? DEFAULT_HOLD_TTL_SECONDS;

      const holdId = this.idGenerator.generate();
      const holdResult = await this.orchestrator.prepareHold({
        tenantId: integration.tenantId,
        unitId: integration.unitId,
        checkIn: command.checkIn,
        checkOut: command.checkOut,
        guestCount: command.guestCount,
        holdId,
        sessionRef: idempotencyKey,
        ttlSeconds,
        mutationOrigin: mutationOriginDirect(),
      });
      if (holdResult.isFailure) {
        return Result.fail(holdResult.getError());
      }

      const hold = holdResult.getValue();
      if (hold.propertyId !== integration.propertyId) {
        return Result.fail(new ValidationError("Resolved property does not match integration"));
      }

      const quoteResult = await this.orchestrator.prepareQuoteForHold({
        tenantId: integration.tenantId,
        hold,
        quoteId: this.idGenerator.generate(),
        snapshotId: this.idGenerator.generate(),
        propertyTimezone: snapshot.property.timezone,
      });
      if (quoteResult.isFailure) {
        return Result.fail(quoteResult.getError());
      }

      const quote = quoteResult.getValue();

      try {
        await this.commerceFlow.saveHoldAndQuote(hold, quote);
      } catch (error) {
        if (error instanceof ConflictError) {
          return Result.fail(error);
        }
        throw error;
      }

      await this.idempotency.save(
        integration.tenantId,
        IDEMPOTENCY_SCOPE,
        idempotencyKey,
        hold.id,
        new Date(Date.now() + IDEMPOTENCY_LEDGER_TTL_MS),
      );

      return Result.ok(mapHoldDto(hold, quote));
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
    command: CreateDirectBookingHoldCommand,
    holdId: string,
  ): Promise<Result<DirectBookingHoldDto, Error>> {
    const hold = await this.holdRepository.findById(holdId, integration.tenantId);
    if (!hold) {
      return Result.fail(new ConflictError("Idempotency key conflict"));
    }

    if (
      hold.unitId !== integration.unitId ||
      hold.propertyId !== integration.propertyId ||
      hold.tenantId !== integration.tenantId
    ) {
      return Result.fail(new ConflictError("Idempotency key conflict"));
    }

    if (
      hold.stayPeriod.checkIn.value !== command.checkIn ||
      hold.stayPeriod.checkOut.value !== command.checkOut ||
      hold.guestCount.value !== command.guestCount
    ) {
      return Result.fail(
        new ConflictError("Idempotency key reused with different request"),
      );
    }

    if (hold.status !== "active" || hold.isExpired()) {
      return Result.fail(new ConflictError("Hold has expired"));
    }

    const quote = await this.quoteRepository.findByHoldId(hold.id, integration.tenantId);
    if (!quote) {
      return Result.fail(new ConflictError("Idempotency key conflict"));
    }

    return Result.ok(mapHoldDto(hold, quote));
  }
}

function mapHoldDto(hold: Hold, quote: Quote): DirectBookingHoldDto {
  return {
    holdId: hold.id,
    quoteId: quote.id,
    checkIn: hold.stayPeriod.checkIn.value,
    checkOut: hold.stayPeriod.checkOut.value,
    guestCount: hold.guestCount.value,
    expiresAt: hold.expiresAt.toISOString(),
    currency: quote.snapshot.currency,
    total: quote.snapshot.totalAmount,
    status: "active",
  };
}

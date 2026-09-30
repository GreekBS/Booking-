import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, NotFoundError, ValidationError } from "../../shared/errors/DomainError";
import type { AvailabilityEvaluationResult } from "../../commerce/availability/AvailabilityEvaluator";
import type { ReservationOrchestrator } from "../../commerce/reservation/ReservationOrchestrator";
import type {
  DirectBookingIntegrationPublicLookup,
  IDirectBookingCatalogPort,
} from "../ports/DirectBookingPorts";
import {
  assertDirectBookingBookable,
  assertIntegrationEnabledForPublicAccess,
  evaluateDirectBookingPublishability,
} from "./publishability";

export interface CheckDirectBookingAvailabilityCommand {
  checkIn: string;
  checkOut: string;
  guestCount: number;
}

export interface DirectBookingAvailabilityDto {
  available: boolean;
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  reasonCodes: string[];
}

/**
 * Public Direct Booking availability — resolves Property/Unit from integration,
 * then reuses ReservationOrchestrator / StayAvailabilityEngine (no duplicate engine).
 */
export class CheckDirectBookingAvailabilityUseCase {
  constructor(
    private readonly catalog: IDirectBookingCatalogPort,
    private readonly orchestrator: ReservationOrchestrator,
  ) {}

  async execute(
    integration: DirectBookingIntegrationPublicLookup,
    command: CheckDirectBookingAvailabilityCommand,
  ): Promise<Result<DirectBookingAvailabilityDto, Error>> {
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
        { requireRatePlan: false },
      );
      assertDirectBookingBookable(publishability);

      if (
        !Number.isInteger(command.guestCount) ||
        command.guestCount < 1 ||
        command.guestCount > 50
      ) {
        return Result.fail(new ValidationError("Invalid guest count"));
      }

      const evaluation = await this.orchestrator.evaluateAvailability({
        tenantId: integration.tenantId,
        unitId: integration.unitId,
        checkIn: command.checkIn,
        checkOut: command.checkOut,
        guestCount: command.guestCount,
      });

      if (evaluation.isFailure) {
        return Result.fail(evaluation.getError());
      }

      return Result.ok(
        mapAvailabilityDto(
          evaluation.getValue(),
          command.checkIn,
          command.checkOut,
          snapshot.currency,
        ),
      );
    } catch (error) {
      if (
        error instanceof ForbiddenError ||
        error instanceof ValidationError ||
        error instanceof NotFoundError
      ) {
        return Result.fail(error);
      }
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function mapAvailabilityDto(
  result: AvailabilityEvaluationResult,
  checkIn: string,
  checkOut: string,
  currency: string,
): DirectBookingAvailabilityDto {
  return {
    available: result.available,
    checkIn,
    checkOut,
    nights: result.nights.length,
    currency,
    reasonCodes: result.reasons.map((r) => r.code),
  };
}

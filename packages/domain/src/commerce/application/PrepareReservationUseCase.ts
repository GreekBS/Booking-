import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import { PERMISSIONS } from "@hcp/permissions";
import type { PermissionChecker } from "../../shared/services/PermissionChecker";
import type { ICatalogQueryPort } from "../ports/CommercePorts";
import { ReservationOrchestrator } from "../reservation/ReservationOrchestrator";
import type { CreateReservationCommand, PreparedReservationCreate } from "../reservation/types";
import { resolveUnitContext } from "./commerceAccess";
import type { MutationOrigin } from "../../shared/types/MutationOrigin";

export class PrepareReservationUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly orchestrator: ReservationOrchestrator,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async prepare(
    command: CreateReservationCommand,
    mutationOrigin?: MutationOrigin | null,
  ): Promise<Result<PreparedReservationCreate, Error>> {
    try {
      const { reservation, profile } = command;

      if (
        !this.permissionChecker.hasPermission(
          profile.actor,
          PERMISSIONS.BOOKING_CREATE_TENANT,
          reservation.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const unitContext = await resolveUnitContext(
        this.catalog,
        reservation.unitId,
        reservation.tenantId,
      );
      if (unitContext.isFailure) {
        return Result.fail(unitContext.getError());
      }

      const { property } = unitContext.getValue();
      if (property.id !== reservation.propertyId) {
        return Result.fail(new ValidationError("Property id does not match unit"));
      }

      const prepared = await this.orchestrator.prepareReservationCreate({
        reservation,
        holdId: this.idGenerator.generate(),
        quoteId: this.idGenerator.generate(),
        snapshotId: this.idGenerator.generate(),
        bookingId: this.idGenerator.generate(),
        propertyTimezone: property.timezone,
        idempotencyKey: profile.idempotencyKey,
        confirmationMode: reservation.confirmationMode ?? "manual",
        mutationOrigin: mutationOrigin ?? null,
      });
      if (prepared.isFailure) {
        return Result.fail(prepared.getError());
      }

      const { hold, quote, booking } = prepared.getValue();
      if (profile.confirmImmediately) {
        booking.confirm(new Date(), mutationOrigin ?? null);
      }

      return Result.ok({ hold, quote, booking });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

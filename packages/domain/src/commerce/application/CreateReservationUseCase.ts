import type { Booking } from "../booking/domain/Booking";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import { Result } from "../../shared/kernel/Result";
import type { ICommerceFlowRepository } from "../ports/CommercePorts";
import type { CreateReservationCommand } from "../reservation/types";
import { PrepareReservationUseCase } from "./PrepareReservationUseCase";

export class CreateReservationUseCase {
  constructor(
    private readonly prepareReservationUseCase: PrepareReservationUseCase,
    private readonly commerceFlowRepository: ICommerceFlowRepository,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    command: CreateReservationCommand,
    audit?: { ipAddress: string | null },
  ): Promise<Result<Booking, Error>> {
    try {
      const prepared = await this.prepareReservationUseCase.prepare(command);
      if (prepared.isFailure) {
        return Result.fail(prepared.getError());
      }

      const { hold, quote, booking } = prepared.getValue();
      const { reservation, profile } = command;

      await this.commerceFlowRepository.saveImportReservation(hold, quote, booking);

      if (profile.writeAudit) {
        await this.auditLogRepository.append({
          tenantId: reservation.tenantId,
          actorId: profile.actor.userId,
          action: "booking.created",
          resourceType: "Booking",
          resourceId: booking.id,
          metadata: {
            quoteId: quote.id,
            holdId: hold.id,
            source: reservation.source,
            externalReference: reservation.externalReference ?? null,
          },
          ipAddress: audit?.ipAddress ?? null,
        });
      }

      return Result.ok(booking);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

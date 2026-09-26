import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { Guest } from "../domain/Guest";
import type { IGuestRepository } from "../ports/IGuestRepository";

export class UpdateGuestUseCase {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLogRepository?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      guestId: string;
      displayName?: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      country?: string | null;
      preferredLanguage?: string | null;
    },
    actor: ActorContext,
    auditContext?: { ipAddress: string | null },
  ): Promise<Result<Guest, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.GUEST_UPDATE_TENANT,
          input.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const guest = await this.guests.findById(input.tenantId, input.guestId);
      if (!guest) {
        return Result.fail(new ValidationError("Guest not found"));
      }
      if (guest.archivedAt || guest.mergedIntoGuestId || guest.anonymizedAt) {
        return Result.fail(new ValidationError("Guest not editable"));
      }

      guest.updateProfile({
        displayName: input.displayName,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        country: input.country,
        preferredLanguage: input.preferredLanguage,
      });

      await this.guests.save(guest);

      if (this.auditLogRepository) {
        await this.auditLogRepository.append({
          tenantId: input.tenantId,
          actorId: actor.userId,
          action: "guest.updated",
          resourceType: "guest",
          resourceId: guest.id,
          metadata: {},
          ipAddress: auditContext?.ipAddress ?? null,
        });
      }

      return Result.ok(guest);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

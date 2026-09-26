import { Result } from "../../shared/kernel/Result";
import { ForbiddenError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import { Guest } from "../domain/Guest";
import type { GuestContactInput, IGuestRepository } from "../ports/IGuestRepository";

export class CreateGuestUseCase {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly ids: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; contact: GuestContactInput },
    actor: ActorContext,
  ): Promise<Result<Guest, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.GUEST_CREATE_TENANT,
          input.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const guest = Guest.create({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        displayName: input.contact.displayName,
        firstName: input.contact.firstName,
        lastName: input.contact.lastName,
        email: input.contact.email,
        phone: input.contact.phone,
        country: input.contact.country,
        preferredLanguage: input.contact.preferredLanguage,
      });

      await this.guests.save(guest);
      return Result.ok(guest);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

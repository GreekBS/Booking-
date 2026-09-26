import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { Guest } from "../domain/Guest";
import type { IGuestRepository } from "../ports/IGuestRepository";

/**
 * CRM-1 read path with Manager property privacy.
 *
 * Tenant-wide readers (GUEST_READ_TENANT / SA): full Guest identity.
 * Assigned readers (GUEST_READ_ASSIGNED): may read Guest identity only when
 * `authorizedPropertyIds` proves at least one authorized Property activity
 * (caller supplies property IDs of bookings they can already see).
 *
 * Notes/tags visibility for Managers is deferred to CRM-3.
 */
export class GetGuestUseCase {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: {
      tenantId: string;
      guestId: string;
      /** Property IDs where this actor has authorized Booking activity for this Guest. */
      authorizedActivityPropertyIds?: string[] | null;
    },
    actor: ActorContext,
  ): Promise<Result<Guest, Error>> {
    try {
      const tenantWide = this.permissionChecker.hasPermission(
        actor,
        PERMISSIONS.GUEST_READ_TENANT,
        input.tenantId,
      );

      if (!tenantWide) {
        const assigned = this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.GUEST_READ_ASSIGNED,
          input.tenantId,
        );
        if (!assigned) {
          return Result.fail(new ForbiddenError());
        }
        const props = input.authorizedActivityPropertyIds ?? [];
        const allowed = actor.propertyIds ?? [];
        const overlap = props.some((p) => allowed.includes(p));
        if (!overlap) {
          return Result.fail(new ForbiddenError());
        }
      }

      const guest = await this.guests.findById(input.tenantId, input.guestId);
      if (!guest) {
        return Result.fail(new ValidationError("Guest not found"));
      }
      return Result.ok(guest);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

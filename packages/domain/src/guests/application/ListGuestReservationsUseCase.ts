import { Result } from "../../shared/kernel/Result";
import { ForbiddenError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IGuestRepository } from "../ports/IGuestRepository";
import { assertGuestReadable } from "./guestAccess";

export class ListGuestReservationsUseCase {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: {
      tenantId: string;
      guestId: string;
      page?: number;
      limit?: number;
    },
    actor: ActorContext,
  ): Promise<
    Result<
      {
        data: Array<{
          id: string;
          propertyId: string;
          unitId: string;
          checkIn: string;
          checkOut: string;
          status: string;
          guestCount: number;
          guestName: string;
          source: string | null;
        }>;
        total: number;
        page: number;
        limit: number;
      },
      Error
    >
  > {
    try {
      const access = await assertGuestReadable({
        permissionChecker: this.permissionChecker,
        actor,
        tenantId: input.tenantId,
        guestId: input.guestId,
        hasVisibleActivity: (allowedPropertyIds) =>
          this.guests.hasVisibleBookingActivity(
            input.tenantId,
            input.guestId,
            allowedPropertyIds,
          ),
      });
      if (access === "forbidden") {
        return Result.fail(new ForbiddenError());
      }

      const allowedPropertyIds =
        access === "tenant"
          ? null
          : this.permissionChecker.hasPermission(
                actor,
                PERMISSIONS.GUEST_READ_ASSIGNED,
                input.tenantId,
              )
            ? actor.propertyIds
            : undefined;

      if (allowedPropertyIds === undefined) {
        return Result.fail(new ForbiddenError());
      }

      const page = Math.max(1, input.page ?? 1);
      const limit = Math.min(100, Math.max(1, input.limit ?? 20));

      return Result.ok(
        await this.guests.listVisibleBookingsForGuest({
          tenantId: input.tenantId,
          guestId: input.guestId,
          allowedPropertyIds,
          page,
          limit,
        }),
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

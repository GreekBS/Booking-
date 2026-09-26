import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type {
  GuestDirectoryFilters,
  IGuestRepository,
  PaginatedGuestDirectory,
} from "../ports/IGuestRepository";
import { resolveGuestDirectoryScope } from "./guestAccess";

export class ListGuestsUseCase {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: {
      tenantId: string;
      /** Active Property id; omit/null only for admin entire-tenant view. */
      propertyId?: string | null;
      /** Admin secondary option: list across entire tenant. */
      entireTenant?: boolean;
      search?: string | null;
      includeArchived?: boolean;
      page?: number;
      limit?: number;
    },
    actor: ActorContext,
  ): Promise<Result<PaginatedGuestDirectory, Error>> {
    try {
      const scope = resolveGuestDirectoryScope(
        this.permissionChecker,
        actor,
        input.tenantId,
        {
          propertyId: input.propertyId,
          entireTenant: input.entireTenant === true,
        },
      );
      if (scope === "forbidden") {
        return Result.fail(new ForbiddenError());
      }

      const page = Math.max(1, input.page ?? 1);
      const limit = Math.min(100, Math.max(1, input.limit ?? 20));

      const filters: GuestDirectoryFilters = {
        tenantId: input.tenantId,
        propertyId: scope.propertyId,
        allowedPropertyIds: scope.allowedPropertyIds,
        search: input.search?.trim() || null,
        includeArchived:
          input.includeArchived === true && scope.canIncludeArchived,
        page,
        limit,
      };

      return Result.ok(await this.guests.searchDirectory(filters));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class SearchGuestsForBookingUseCase {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  /**
   * Compact Guest picker for Manual Booking.
   * Active Guests only; Managers scoped to authorized property activity.
   */
  async execute(
    input: {
      tenantId: string;
      propertyId: string;
      search: string;
      limit?: number;
    },
    actor: ActorContext,
  ): Promise<
    Result<
      Array<{
        id: string;
        displayName: string;
        email: string | null;
        phone: string | null;
      }>,
      Error
    >
  > {
    try {
      const search = input.search.trim();
      if (search.length < 2) {
        return Result.ok([]);
      }

      const scope = resolveGuestDirectoryScope(
        this.permissionChecker,
        actor,
        input.tenantId,
        { propertyId: input.propertyId, entireTenant: false },
      );
      if (scope === "forbidden") {
        return Result.fail(new ForbiddenError());
      }

      const page = await this.guests.searchDirectory({
        tenantId: input.tenantId,
        propertyId: scope.propertyId,
        allowedPropertyIds: scope.allowedPropertyIds,
        search,
        includeArchived: false,
        page: 1,
        limit: Math.min(25, Math.max(1, input.limit ?? 10)),
      });

      return Result.ok(
        page.data
          .filter((row) => row.guest.isActive && !row.guest.mergedIntoGuestId && !row.guest.anonymizedAt)
          .map((row) => ({
            id: row.guest.id,
            displayName: row.guest.displayName,
            email: row.guest.email,
            phone: row.guest.phone,
          })),
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetGuestForBookingSelectionUseCase {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  /** Validate Guest is usable for explicit Manual Booking selection. */
  async execute(
    input: { tenantId: string; guestId: string; propertyId: string },
    actor: ActorContext,
  ): Promise<
    Result<
      { id: string; displayName: string; email: string | null; phone: string | null },
      Error
    >
  > {
    try {
      const canBook = this.permissionChecker.hasPermission(
        actor,
        PERMISSIONS.BOOKING_CREATE_TENANT,
        input.tenantId,
      );
      if (!canBook) {
        return Result.fail(new ForbiddenError());
      }

      const guest = await this.guests.findById(input.tenantId, input.guestId);
      if (!guest) {
        return Result.fail(new ValidationError("Guest not found"));
      }
      if (!guest.isActive || guest.mergedIntoGuestId || guest.anonymizedAt) {
        return Result.fail(new ValidationError("Guest not usable for new reservation"));
      }

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
        const visible = await this.guests.hasVisibleBookingActivity(
          input.tenantId,
          guest.id,
          actor.propertyIds,
        );
        // Manager may also select a Guest they are creating a booking for at assigned property
        // even if no prior activity — allow when property is assigned.
        const propertyOk = (actor.propertyIds ?? []).includes(input.propertyId);
        if (!visible && !propertyOk) {
          return Result.fail(new ForbiddenError());
        }
      }

      return Result.ok({
        id: guest.id,
        displayName: guest.displayName,
        email: guest.email,
        phone: guest.phone,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { Hold } from "../booking/domain/Hold";
import type {
  BookingSearchFilters,
  HoldListFilters,
  IBookingRepository,
  IHoldRepository,
  PaginatedBookings,
} from "../ports/CommercePorts";
import {
  assertCommercePropertyAccess,
  canAccessCommerceProperty,
} from "./commerceAccess";

function resolveAllowedPropertyIds(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId?: string,
): string[] | null | undefined {
  if (permissionChecker.hasPermission(actor, PERMISSIONS.BOOKING_READ_TENANT, tenantId)) {
    return propertyId ? undefined : null;
  }

  if (!permissionChecker.hasPermission(actor, PERMISSIONS.BOOKING_READ_ASSIGNED, tenantId)) {
    return undefined;
  }

  if (propertyId && actor.propertyIds && !actor.propertyIds.includes(propertyId)) {
    return undefined;
  }

  return propertyId ? undefined : actor.propertyIds;
}

export class SearchBookingsUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    filters: Omit<BookingSearchFilters, "allowedPropertyIds">,
    actor: ActorContext,
  ): Promise<Result<PaginatedBookings, Error>> {
    try {
      const allowedPropertyIds = resolveAllowedPropertyIds(
        this.permissionChecker,
        actor,
        filters.tenantId,
        filters.propertyId,
      );

      if (allowedPropertyIds === undefined) {
        return Result.fail(new ForbiddenError());
      }

      const result = await this.bookingRepository.search({
        ...filters,
        allowedPropertyIds,
      });

      return Result.ok(result);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ListHoldsUseCase {
  constructor(
    private readonly holdRepository: IHoldRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    filters: Omit<HoldListFilters, "allowedPropertyIds">,
    actor: ActorContext,
  ): Promise<Result<Hold[], Error>> {
    try {
      if (!this.permissionChecker.hasPermission(actor, PERMISSIONS.HOLD_READ, tenantId)) {
        const hasAssigned =
          filters.propertyId &&
          canAccessCommerceProperty(
            this.permissionChecker,
            actor,
            tenantId,
            filters.propertyId,
            PERMISSIONS.HOLD_READ,
            PERMISSIONS.AVAILABILITY_READ_ASSIGNED,
          );

        if (!hasAssigned) {
          return Result.fail(new ForbiddenError());
        }
      }

      const allowedPropertyIds = this.permissionChecker.hasPermission(
        actor,
        PERMISSIONS.HOLD_READ,
        tenantId,
      )
        ? filters.propertyId
          ? undefined
          : null
        : actor.propertyIds;

      if (allowedPropertyIds === undefined && !filters.propertyId) {
        return Result.fail(new ForbiddenError());
      }

      const holds = await this.holdRepository.findActiveByTenant(tenantId, {
        ...filters,
        allowedPropertyIds,
      });

      return Result.ok(holds);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetHoldUseCase {
  constructor(
    private readonly holdRepository: IHoldRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    holdId: string,
    actor: ActorContext,
  ): Promise<Result<Hold, Error>> {
    try {
      const hold = await this.holdRepository.findById(holdId, tenantId);
      if (!hold) {
        return Result.fail(new ValidationError("Hold not found"));
      }

      if (!this.permissionChecker.hasPermission(actor, PERMISSIONS.HOLD_READ, tenantId)) {
        assertCommercePropertyAccess(
          this.permissionChecker,
          actor,
          tenantId,
          hold.propertyId,
          PERMISSIONS.HOLD_READ,
          PERMISSIONS.AVAILABILITY_READ_ASSIGNED,
        );
      }

      return Result.ok(hold);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

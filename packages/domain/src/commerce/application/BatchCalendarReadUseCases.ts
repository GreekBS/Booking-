import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { Permission } from "@hcp/permissions";
import type {
  IAvailabilityRulesRepository,
  IBookingRepository,
  ICalendarBlockRepository,
  ICatalogQueryPort,
  IHoldRepository,
  IRatePlanRepository,
} from "../ports/CommercePorts";
import type {
  RatePlanProps,
  UnitAvailabilityRulesProps,
} from "../shared/types/CommerceTypes";
import {
  assertCommercePropertyAccess,
  canAccessCommerceProperty,
} from "./commerceAccess";
import type { UnitCalendarResult } from "./CommerceUseCases";

const DEFAULT_RULES: UnitAvailabilityRulesProps = {
  minNights: 1,
  maxNights: 30,
  checkInDays: [0, 1, 2, 3, 4, 5, 6],
  checkOutDays: [0, 1, 2, 3, 4, 5, 6],
  advanceMinDays: 0,
  advanceMaxDays: 365,
  turnoverNights: 0,
};

/**
 * Resolve all requested units under tenant isolation.
 * Any missing / foreign unit fails the whole batch with a non-leaky error.
 */
async function resolveAuthorizedUnits(
  catalog: ICatalogQueryPort,
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  unitIds: string[],
  tenantPermission: Permission,
  assignedPermission: Permission,
): Promise<Result<Array<{ unitId: string; propertyId: string }>, Error>> {
  const uniqueIds = [...new Set(unitIds)];
  if (uniqueIds.length === 0) {
    return Result.fail(new ValidationError("unitIds required"));
  }

  const units = await catalog.getUnitsByIds(uniqueIds, tenantId);
  if (units.length !== uniqueIds.length) {
    return Result.fail(new ValidationError("One or more units were not found"));
  }

  const propertyIds = [...new Set(units.map((u) => u.propertyId))];
  const properties = await catalog.getPropertiesByIds(propertyIds, tenantId);
  if (properties.length !== propertyIds.length) {
    return Result.fail(new ValidationError("One or more units were not found"));
  }

  const propertyById = new Map(properties.map((p) => [p.id, p]));

  for (const unit of units) {
    const property = propertyById.get(unit.propertyId);
    if (!property) {
      return Result.fail(new ValidationError("One or more units were not found"));
    }
    if (unit.status !== "active" || property.status !== "active") {
      return Result.fail(new ValidationError("Unit is not available for booking"));
    }
    if (
      !canAccessCommerceProperty(
        permissionChecker,
        actor,
        tenantId,
        unit.propertyId,
        tenantPermission,
        assignedPermission,
      )
    ) {
      return Result.fail(new ForbiddenError());
    }
  }

  return Result.ok(units.map((u) => ({ unitId: u.id, propertyId: u.propertyId })));
}

export interface GetUnitsCalendarBatchCommand {
  tenantId: string;
  unitIds: string[];
  from: string;
  to: string;
}

export type UnitsCalendarBatchResult = Record<string, UnitCalendarResult>;

/**
 * Batched unit calendars — authoritative blocks/holds/bookings via parallel multi-unit queries.
 * Never N× sequential per-unit DB round-trips.
 */
export class GetUnitsCalendarBatchUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly calendarBlocks: ICalendarBlockRepository,
    private readonly holdRepository: IHoldRepository,
    private readonly bookingRepository: IBookingRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: GetUnitsCalendarBatchCommand,
    actor: ActorContext,
  ): Promise<Result<UnitsCalendarBatchResult, Error>> {
    try {
      const resolved = await resolveAuthorizedUnits(
        this.catalog,
        this.permissionChecker,
        actor,
        command.tenantId,
        command.unitIds,
        PERMISSIONS.BOOKING_READ_TENANT,
        PERMISSIONS.BOOKING_READ_ASSIGNED,
      );
      if (resolved.isFailure) {
        return Result.fail(resolved.getError());
      }

      const unitIds = resolved.getValue().map((u) => u.unitId);
      const range = { from: command.from, to: command.to };

      const [blocks, holds, bookings] = await Promise.all([
        this.calendarBlocks.findCalendarBlocksByUnits(unitIds, command.tenantId, range),
        this.holdRepository.findActiveByUnits(unitIds, command.tenantId, range),
        this.bookingRepository.findByUnits(unitIds, command.tenantId, range),
      ]);

      const byUnit: UnitsCalendarBatchResult = {};
      for (const unitId of unitIds) {
        byUnit[unitId] = { blocks: [], holds: [], bookings: [] };
      }

      for (const block of blocks) {
        const entry = byUnit[block.unitId];
        if (entry) entry.blocks.push(block);
      }
      for (const hold of holds) {
        const entry = byUnit[hold.unitId];
        if (entry) {
          entry.holds.push({
            id: hold.id,
            checkIn: hold.stayPeriod.checkIn.value,
            checkOut: hold.stayPeriod.checkOut.value,
            status: hold.status,
            expiresAt: hold.expiresAt.toISOString(),
          });
        }
      }
      for (const booking of bookings) {
        const entry = byUnit[booking.unitId];
        if (entry) {
          entry.bookings.push({
            id: booking.id,
            checkIn: booking.stayPeriod.checkIn.value,
            checkOut: booking.stayPeriod.checkOut.value,
            status: booking.status,
            guestName: booking.guest.name,
          });
        }
      }

      return Result.ok(byUnit);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface GetUnitsRatePlansBatchCommand {
  tenantId: string;
  unitIds: string[];
}

export type UnitsRatePlansBatchResult = Record<string, RatePlanProps | null>;

export class GetUnitsRatePlansBatchUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly ratePlanRepository: IRatePlanRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: GetUnitsRatePlansBatchCommand,
    actor: ActorContext,
  ): Promise<Result<UnitsRatePlansBatchResult, Error>> {
    try {
      const resolved = await resolveAuthorizedUnits(
        this.catalog,
        this.permissionChecker,
        actor,
        command.tenantId,
        command.unitIds,
        PERMISSIONS.PRICING_READ_TENANT,
        PERMISSIONS.PRICING_READ_ASSIGNED,
      );
      if (resolved.isFailure) {
        return Result.fail(resolved.getError());
      }

      const unitIds = resolved.getValue().map((u) => u.unitId);
      const plans = await this.ratePlanRepository.findByUnitIds(unitIds, command.tenantId);

      const byUnit: UnitsRatePlansBatchResult = {};
      for (const unitId of unitIds) {
        byUnit[unitId] = plans.get(unitId) ?? null;
      }
      return Result.ok(byUnit);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface GetUnitsAvailabilityRulesBatchCommand {
  tenantId: string;
  unitIds: string[];
}

export type UnitsAvailabilityRulesBatchResult = Record<string, UnitAvailabilityRulesProps>;

export class GetUnitsAvailabilityRulesBatchUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly availabilityRules: IAvailabilityRulesRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: GetUnitsAvailabilityRulesBatchCommand,
    actor: ActorContext,
  ): Promise<Result<UnitsAvailabilityRulesBatchResult, Error>> {
    try {
      const resolved = await resolveAuthorizedUnits(
        this.catalog,
        this.permissionChecker,
        actor,
        command.tenantId,
        command.unitIds,
        PERMISSIONS.AVAILABILITY_READ_TENANT,
        PERMISSIONS.AVAILABILITY_READ_ASSIGNED,
      );
      if (resolved.isFailure) {
        return Result.fail(resolved.getError());
      }

      const unitIds = resolved.getValue().map((u) => u.unitId);
      const rulesMap = await this.availabilityRules.findByUnitIds(unitIds, command.tenantId);

      const byUnit: UnitsAvailabilityRulesBatchResult = {};
      for (const unitId of unitIds) {
        byUnit[unitId] = rulesMap.get(unitId) ?? DEFAULT_RULES;
      }
      return Result.ok(byUnit);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** Re-export for call sites that assert single-unit access outside this module. */
export { assertCommercePropertyAccess };

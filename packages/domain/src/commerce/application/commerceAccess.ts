import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { Permission } from "@hcp/permissions";
import type {
  CatalogPropertyReadModel,
  CatalogUnitReadModel,
  ICatalogQueryPort,
} from "../ports/CommercePorts";
import { Result } from "../../shared/kernel/Result";

export interface UnitContext {
  unit: CatalogUnitReadModel;
  property: CatalogPropertyReadModel;
}

export async function resolveUnitContext(
  catalog: ICatalogQueryPort,
  unitId: string,
  tenantId: string,
): Promise<Result<UnitContext, Error>> {
  return resolveUnitContextInternal(catalog, unitId, tenantId, {
    requireActiveForBooking: true,
  });
}

/**
 * Operator inventory/pricing READ paths — unit may be inactive/archived but still visible.
 * Does not weaken booking/write paths that use {@link resolveUnitContext}.
 */
export async function resolveUnitContextForOperatorRead(
  catalog: ICatalogQueryPort,
  unitId: string,
  tenantId: string,
): Promise<Result<UnitContext, Error>> {
  return resolveUnitContextInternal(catalog, unitId, tenantId, {
    requireActiveForBooking: false,
  });
}

async function resolveUnitContextInternal(
  catalog: ICatalogQueryPort,
  unitId: string,
  tenantId: string,
  options: { requireActiveForBooking: boolean },
): Promise<Result<UnitContext, Error>> {
  const unit = await catalog.getUnit(unitId, tenantId);
  if (!unit) {
    return Result.fail(new ValidationError("Unit not found"));
  }

  const property = await catalog.getProperty(unit.propertyId, tenantId);
  if (!property) {
    return Result.fail(new ValidationError("Property not found"));
  }

  if (
    options.requireActiveForBooking &&
    (unit.status !== "active" || property.status !== "active")
  ) {
    return Result.fail(new ValidationError("Unit is not available for booking"));
  }

  return Result.ok({ unit, property });
}

export function canAccessCommerceProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
  tenantPermission: Permission,
  assignedPermission: Permission,
): boolean {
  if (permissionChecker.hasPermission(actor, tenantPermission, tenantId)) {
    return true;
  }

  if (!permissionChecker.hasPermission(actor, assignedPermission, tenantId)) {
    return false;
  }

  if (actor.propertyIds === null) {
    return true;
  }

  return actor.propertyIds.includes(propertyId);
}

export function assertCommercePropertyAccess(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
  tenantPermission: Permission,
  assignedPermission: Permission,
): void {
  if (
    !canAccessCommerceProperty(
      permissionChecker,
      actor,
      tenantId,
      propertyId,
      tenantPermission,
      assignedPermission,
    )
  ) {
    throw new ForbiddenError();
  }
}

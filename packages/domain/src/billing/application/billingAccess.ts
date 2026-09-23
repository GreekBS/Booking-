import { ForbiddenError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";

export function assertCanAccessBookingProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  if (permissionChecker.hasPermission(actor, PERMISSIONS.BOOKING_READ_TENANT, tenantId)) {
    return true;
  }
  if (!permissionChecker.hasPermission(actor, PERMISSIONS.BOOKING_READ_ASSIGNED, tenantId)) {
    return false;
  }
  if (actor.isSuperAdmin) return true;
  if (!actor.propertyIds || actor.propertyIds.length === 0) return false;
  return actor.propertyIds.includes(propertyId);
}

export function assertCanOpenFolio(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): void {
  const canRead = assertCanAccessBookingProperty(
    permissionChecker,
    actor,
    tenantId,
    propertyId,
  );
  if (!canRead) {
    throw new ForbiddenError("Not allowed");
  }
  const canUpdate =
    permissionChecker.hasPermission(actor, PERMISSIONS.BOOKING_UPDATE_TENANT, tenantId) ||
    permissionChecker.hasPermission(actor, PERMISSIONS.BOOKING_CREATE_TENANT, tenantId) ||
    actor.isSuperAdmin ||
    actor.role === "super_admin";
  if (!canUpdate) {
    throw new ForbiddenError("Not allowed to open folio");
  }
}

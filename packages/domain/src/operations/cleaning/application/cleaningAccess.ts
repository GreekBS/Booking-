import type {
  ActorContext,
  PermissionChecker,
} from "../../../shared/services/PermissionChecker";
import {
  canUpdateHousekeepingOnProperty,
  canUpdateTaskOnProperty,
  resolveTaskListScope,
} from "../../application/taskAccess";

/**
 * QR Cleaning reuses the Housekeeping property ACL verbatim: tenant admins act
 * anywhere in the tenant, managers only on their assigned properties.
 */

export function canReadCleaningOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  return (
    resolveTaskListScope(permissionChecker, actor, tenantId, { propertyId }) !==
    "forbidden"
  );
}

/** Performing a cleaning mutates both the task and the unit readiness. */
export function canPerformCleaningOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  return (
    canUpdateTaskOnProperty(permissionChecker, actor, tenantId, propertyId) &&
    canUpdateHousekeepingOnProperty(
      permissionChecker,
      actor,
      tenantId,
      propertyId,
    )
  );
}

/** QR issuance/rotation and checklist authoring are property-configuration writes. */
export function canManageCleaningConfigOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  return canUpdateTaskOnProperty(
    permissionChecker,
    actor,
    tenantId,
    propertyId,
  );
}

/** Tenant-wide history scope resolution, mirroring task list scoping. */
export function resolveCleaningHistoryScope(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  options: { propertyId?: string | null; entireTenant?: boolean },
): { propertyId: string | null; allowedPropertyIds: string[] | null } | "forbidden" {
  return resolveTaskListScope(permissionChecker, actor, tenantId, options);
}

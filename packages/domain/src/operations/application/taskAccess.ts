import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";

export type TaskListScope =
  | {
      propertyId: string | null;
      allowedPropertyIds: string[] | null;
    }
  | "forbidden";

export function resolveTaskListScope(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  options: { propertyId?: string | null; entireTenant?: boolean },
): TaskListScope {
  const tenantWide = permissionChecker.hasPermission(
    actor,
    PERMISSIONS.TASK_READ_TENANT,
    tenantId,
  );

  if (tenantWide) {
    if (options.entireTenant) {
      return { propertyId: null, allowedPropertyIds: null };
    }
    const propertyId = options.propertyId?.trim() || null;
    if (!propertyId) {
      return "forbidden";
    }
    return { propertyId, allowedPropertyIds: null };
  }

  const assigned = permissionChecker.hasPermission(
    actor,
    PERMISSIONS.TASK_READ_ASSIGNED,
    tenantId,
  );
  if (!assigned) {
    return "forbidden";
  }

  const propertyId = options.propertyId?.trim() || null;
  if (!propertyId) {
    return "forbidden";
  }
  if (!(actor.propertyIds ?? []).includes(propertyId)) {
    return "forbidden";
  }

  return {
    propertyId,
    allowedPropertyIds: actor.propertyIds,
  };
}

export function canCreateTaskOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  if (
    permissionChecker.hasPermission(actor, PERMISSIONS.TASK_CREATE_TENANT, tenantId)
  ) {
    return true;
  }
  if (
    !permissionChecker.hasPermission(actor, PERMISSIONS.TASK_CREATE_ASSIGNED, tenantId)
  ) {
    return false;
  }
  return (actor.propertyIds ?? []).includes(propertyId);
}

export function canUpdateTaskOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  if (
    permissionChecker.hasPermission(actor, PERMISSIONS.TASK_UPDATE_TENANT, tenantId)
  ) {
    return true;
  }
  if (
    !permissionChecker.hasPermission(actor, PERMISSIONS.TASK_UPDATE_ASSIGNED, tenantId)
  ) {
    return false;
  }
  return (actor.propertyIds ?? []).includes(propertyId);
}

export function canAssignTasks(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
): boolean {
  return permissionChecker.hasPermission(
    actor,
    PERMISSIONS.TASK_ASSIGN_TENANT,
    tenantId,
  );
}

/** Managers may assign within property if they have update assigned + we allow it. */
export function canAssignOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  if (canAssignTasks(permissionChecker, actor, tenantId)) {
    return true;
  }
  // Manager: treat assign as update on assigned property
  return canUpdateTaskOnProperty(permissionChecker, actor, tenantId, propertyId);
}

export function canUpdateHousekeepingOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  if (
    permissionChecker.hasPermission(
      actor,
      PERMISSIONS.HOUSEKEEPING_UPDATE_TENANT,
      tenantId,
    )
  ) {
    return true;
  }
  if (
    !permissionChecker.hasPermission(
      actor,
      PERMISSIONS.HOUSEKEEPING_UPDATE_ASSIGNED,
      tenantId,
    )
  ) {
    return false;
  }
  return (actor.propertyIds ?? []).includes(propertyId);
}

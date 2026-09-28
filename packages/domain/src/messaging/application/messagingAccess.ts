import type {
  ActorContext,
  PermissionChecker,
} from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";

/**
 * Messaging reuses the property ACL verbatim: tenant admins act anywhere in the
 * tenant, managers only on their assigned properties. Dedicated
 * `messaging:*` permissions can replace these constants without touching the
 * call sites.
 */

export function canReadMessagingOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  if (
    permissionChecker.hasPermission(
      actor,
      PERMISSIONS.PROPERTY_READ_TENANT,
      tenantId,
    )
  ) {
    return true;
  }
  if (
    !permissionChecker.hasPermission(
      actor,
      PERMISSIONS.PROPERTY_READ_ASSIGNED,
      tenantId,
    )
  ) {
    return false;
  }
  return (actor.propertyIds ?? []).includes(propertyId);
}

/** Sending messages and acting on escalations are property-scoped writes. */
export function canWriteMessagingOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  if (
    permissionChecker.hasPermission(
      actor,
      PERMISSIONS.PROPERTY_UPDATE_TENANT,
      tenantId,
    )
  ) {
    return true;
  }
  if (
    !permissionChecker.hasPermission(
      actor,
      PERMISSIONS.PROPERTY_UPDATE_ASSIGNED,
      tenantId,
    )
  ) {
    return false;
  }
  return (actor.propertyIds ?? []).includes(propertyId);
}

/** Assistant profile, guest knowledge and FAQs are property configuration. */
export function canManageAssistantConfigOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  return canWriteMessagingOnProperty(
    permissionChecker,
    actor,
    tenantId,
    propertyId,
  );
}

export type MessagingListScope =
  | {
      propertyId: string | null;
      allowedPropertyIds: string[] | null;
    }
  | "forbidden";

/**
 * List visibility, mirroring `resolveTaskListScope`:
 * - tenant reader: Active Property by default, `entireTenant=true` → tenant-wide.
 * - manager: assigned properties only, `propertyId` required.
 */
export function resolveMessagingListScope(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  options: { propertyId?: string | null; entireTenant?: boolean },
): MessagingListScope {
  const tenantWide = permissionChecker.hasPermission(
    actor,
    PERMISSIONS.PROPERTY_READ_TENANT,
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

  if (
    !permissionChecker.hasPermission(
      actor,
      PERMISSIONS.PROPERTY_READ_ASSIGNED,
      tenantId,
    )
  ) {
    return "forbidden";
  }

  const propertyId = options.propertyId?.trim() || null;
  if (!propertyId) {
    return "forbidden";
  }
  if (!(actor.propertyIds ?? []).includes(propertyId)) {
    return "forbidden";
  }

  return { propertyId, allowedPropertyIds: actor.propertyIds };
}

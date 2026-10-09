import { PERMISSIONS } from "@hcp/permissions";
import type {
  ActorContext,
  PermissionChecker,
} from "../../shared/services/PermissionChecker";

/**
 * Property-scoped Website Builder ACL.
 * Tenant admins / SA use `:tenant` permissions; managers need `:assigned`
 * plus membership on the property (mirrors messagingAccess).
 */

function actorAssignedToProperty(
  actor: ActorContext,
  propertyId: string,
): boolean {
  return (actor.propertyIds ?? []).includes(propertyId);
}

export function canReadWebsiteOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  if (
    permissionChecker.hasPermission(
      actor,
      PERMISSIONS.WEBSITE_READ_TENANT,
      tenantId,
    )
  ) {
    return true;
  }
  if (
    !permissionChecker.hasPermission(
      actor,
      PERMISSIONS.WEBSITE_READ_ASSIGNED,
      tenantId,
    )
  ) {
    return false;
  }
  return actorAssignedToProperty(actor, propertyId);
}

export function canEditWebsiteOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  if (
    permissionChecker.hasPermission(
      actor,
      PERMISSIONS.WEBSITE_EDIT_TENANT,
      tenantId,
    )
  ) {
    return true;
  }
  if (
    !permissionChecker.hasPermission(
      actor,
      PERMISSIONS.WEBSITE_EDIT_ASSIGNED,
      tenantId,
    )
  ) {
    return false;
  }
  return actorAssignedToProperty(actor, propertyId);
}

export function canPublishWebsiteOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  if (
    permissionChecker.hasPermission(
      actor,
      PERMISSIONS.WEBSITE_PUBLISH_TENANT,
      tenantId,
    )
  ) {
    return true;
  }
  if (
    !permissionChecker.hasPermission(
      actor,
      PERMISSIONS.WEBSITE_PUBLISH_ASSIGNED,
      tenantId,
    )
  ) {
    return false;
  }
  return actorAssignedToProperty(actor, propertyId);
}

export function canReadWebsiteMediaOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  if (
    permissionChecker.hasPermission(
      actor,
      PERMISSIONS.WEBSITE_MEDIA_READ_TENANT,
      tenantId,
    )
  ) {
    return true;
  }
  if (
    !permissionChecker.hasPermission(
      actor,
      PERMISSIONS.WEBSITE_MEDIA_READ_ASSIGNED,
      tenantId,
    )
  ) {
    return false;
  }
  return actorAssignedToProperty(actor, propertyId);
}

export function canUploadWebsiteMediaOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  if (
    permissionChecker.hasPermission(
      actor,
      PERMISSIONS.WEBSITE_MEDIA_UPLOAD_TENANT,
      tenantId,
    )
  ) {
    return true;
  }
  if (
    !permissionChecker.hasPermission(
      actor,
      PERMISSIONS.WEBSITE_MEDIA_UPLOAD_ASSIGNED,
      tenantId,
    )
  ) {
    return false;
  }
  return actorAssignedToProperty(actor, propertyId);
}

export function canDeleteWebsiteMediaOnProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  _propertyId: string,
): boolean {
  void _propertyId;
  if (
    permissionChecker.hasPermission(
      actor,
      PERMISSIONS.WEBSITE_MEDIA_DELETE_TENANT,
      tenantId,
    )
  ) {
    return true;
  }
  // No assigned delete — managers cannot delete media (tenant-admin only).
  return false;
}

export type WebsiteListScope =
  | {
      propertyId: string | null;
      allowedPropertyIds: string[] | null;
    }
  | "forbidden";

/**
 * List/filter scope for websites (A3 UI).
 * - tenant reader: Active Property by default; `entireTenant` → tenant-wide.
 * - manager: assigned property required.
 */
export function resolveWebsiteListScope(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  options: { propertyId?: string | null; entireTenant?: boolean },
): WebsiteListScope {
  const tenantWide = permissionChecker.hasPermission(
    actor,
    PERMISSIONS.WEBSITE_READ_TENANT,
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
      PERMISSIONS.WEBSITE_READ_ASSIGNED,
      tenantId,
    )
  ) {
    return "forbidden";
  }

  const propertyId = options.propertyId?.trim() || null;
  if (!propertyId) {
    return "forbidden";
  }
  if (!actorAssignedToProperty(actor, propertyId)) {
    return "forbidden";
  }

  return { propertyId, allowedPropertyIds: actor.propertyIds };
}

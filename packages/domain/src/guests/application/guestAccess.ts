import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";

export type GuestDirectoryScope =
  | {
      propertyId: string | null;
      allowedPropertyIds: string[] | null;
      canIncludeArchived: boolean;
    }
  | "forbidden";

/**
 * Resolve directory visibility:
 * - Admin / SA: Active Property by default; entireTenant=true → tenant-wide.
 * - Manager: only assigned properties; propertyId must be assigned.
 */
export function resolveGuestDirectoryScope(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  options: { propertyId?: string | null; entireTenant?: boolean },
): GuestDirectoryScope {
  const tenantWide = permissionChecker.hasPermission(
    actor,
    PERMISSIONS.GUEST_READ_TENANT,
    tenantId,
  );

  if (tenantWide) {
    if (options.entireTenant) {
      return {
        propertyId: null,
        allowedPropertyIds: null,
        canIncludeArchived: true,
      };
    }
    const propertyId = options.propertyId?.trim() || null;
    if (!propertyId) {
      return "forbidden";
    }
    return {
      propertyId,
      allowedPropertyIds: null,
      canIncludeArchived: true,
    };
  }

  const assigned = permissionChecker.hasPermission(
    actor,
    PERMISSIONS.GUEST_READ_ASSIGNED,
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
    canIncludeArchived: false,
  };
}

/** Manager vs Admin visibility for a single Guest profile. */
export async function assertGuestReadable(params: {
  permissionChecker: PermissionChecker;
  actor: ActorContext;
  tenantId: string;
  guestId: string;
  hasVisibleActivity: (allowedPropertyIds: string[] | null) => Promise<boolean>;
}): Promise<"tenant" | "assigned" | "forbidden"> {
  const { permissionChecker, actor, tenantId } = params;
  if (permissionChecker.hasPermission(actor, PERMISSIONS.GUEST_READ_TENANT, tenantId)) {
    return "tenant";
  }
  if (!permissionChecker.hasPermission(actor, PERMISSIONS.GUEST_READ_ASSIGNED, tenantId)) {
    return "forbidden";
  }
  const ok = await params.hasVisibleActivity(actor.propertyIds);
  return ok ? "assigned" : "forbidden";
}

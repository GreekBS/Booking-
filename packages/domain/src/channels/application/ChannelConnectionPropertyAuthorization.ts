import { ForbiddenError } from "../../shared/errors/DomainError";
import type { ActorContext, PermissionChecker } from "../../shared/services/PermissionChecker";
import { resolveConnectionRelevantPropertyIds } from "./channelConnectionPropertyRelevance";

/**
 * Property ACL for Channel Manager (Active Property 1.2).
 * Tenant CHANNELS_CONNECTION_MANAGE remains required separately.
 * Restricted actors (manager with propertyIds) must satisfy property ACL;
 * tenant admins (propertyIds null) pass after canAccessProperty.
 */
export function assertActorCanAccessChannelProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): void {
  const id = propertyId.trim();
  if (
    !permissionChecker.canAccessProperty(actor, tenantId, id, "property:read")
  ) {
    throw new ForbiddenError("Property access denied");
  }
  if (
    actor.propertyIds !== null &&
    !actor.isSuperAdmin &&
    actor.role !== "admin" &&
    !actor.propertyIds.includes(id)
  ) {
    throw new ForbiddenError("Property access denied");
  }
}

export function actorMayAccessChannelProperty(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
): boolean {
  try {
    assertActorCanAccessChannelProperty(
      permissionChecker,
      actor,
      tenantId,
      propertyId,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Read access to a connection:
 * - Tenant-wide actor (propertyIds null / admin / SA): allowed after manage permission.
 * - Restricted actor: must access at least one relevant property.
 * - Unmapped + no workspace affinity: fail closed for restricted actors.
 */
export function assertActorCanReadChannelConnection(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  relevantPropertyIds: readonly string[],
): void {
  if (actor.isSuperAdmin || actor.role === "super_admin" || actor.role === "admin") {
    if (actor.propertyIds === null) {
      return;
    }
  }
  if (actor.propertyIds === null) {
    return;
  }
  if (relevantPropertyIds.length === 0) {
    throw new ForbiddenError("Property access denied");
  }
  const allowed = relevantPropertyIds.some((propertyId) =>
    actorMayAccessChannelProperty(permissionChecker, actor, tenantId, propertyId),
  );
  if (!allowed) {
    throw new ForbiddenError("Property access denied");
  }
}

/**
 * Connection-wide operational actions (activate/pause/poll/disconnect/…).
 * Restricted actors must be allowed on EVERY relevant property (fail closed
 * for shared multi-property connections).
 */
export function assertActorCanOperateChannelConnection(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  relevantPropertyIds: readonly string[],
): void {
  if (actor.isSuperAdmin || actor.role === "super_admin" || actor.role === "admin") {
    if (actor.propertyIds === null) {
      return;
    }
  }
  if (actor.propertyIds === null) {
    return;
  }
  if (relevantPropertyIds.length === 0) {
    throw new ForbiddenError("Property access denied");
  }
  for (const propertyId of relevantPropertyIds) {
    assertActorCanAccessChannelProperty(
      permissionChecker,
      actor,
      tenantId,
      propertyId,
    );
  }
}

export function filterMappingsVisibleToActor<
  T extends { propertyId: string | null | undefined },
>(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  mappings: readonly T[],
): T[] {
  if (actor.propertyIds === null || actor.role === "admin" || actor.isSuperAdmin) {
    return [...mappings];
  }
  return mappings.filter((mapping) => {
    const propertyId = mapping.propertyId?.trim() ?? "";
    if (propertyId.length === 0) {
      return false;
    }
    return actorMayAccessChannelProperty(
      permissionChecker,
      actor,
      tenantId,
      propertyId,
    );
  });
}

export function resolveRelevantPropertyIdsFromSources(input: {
  workspacePropertyId: string | null | undefined;
  listingMappings: ReadonlyArray<{ propertyId: string | null | undefined; status: string }>;
  productMappings: ReadonlyArray<{ propertyId: string | null | undefined; status: string }>;
}): string[] {
  return resolveConnectionRelevantPropertyIds(input);
}

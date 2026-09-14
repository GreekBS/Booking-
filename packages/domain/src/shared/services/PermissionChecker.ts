import { ForbiddenError } from "../errors/DomainError";
import type { TenantRole } from "../types/index";
import {
  ROLE_PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
  type Permission,
  type PermissionScope,
} from "@hcp/permissions";

export interface ActorContext {
  userId: string;
  role: TenantRole | "super_admin";
  propertyIds: string[] | null;
  isSuperAdmin?: boolean;
}

export class PermissionChecker {
  hasPermission(
    actor: ActorContext,
    permission: Permission,
    tenantId: string,
  ): boolean {
    void tenantId;
    if (actor.isSuperAdmin || actor.role === "super_admin") {
      return SUPER_ADMIN_PERMISSIONS.some(
        (granted) =>
          granted === permission || this.matchPermission([granted], permission),
      );
    }

    const rolePermissions = ROLE_PERMISSIONS[actor.role as TenantRole] ?? [];
    return this.matchPermission(rolePermissions, permission);
  }

  canAccessProperty(
    actor: ActorContext,
    _tenantId: string,
    propertyId: string,
    action: "property:read" | "property:update" | "property:delete",
  ): boolean {
    if (actor.isSuperAdmin || actor.role === "super_admin") {
      return true;
    }

    if (actor.role === "admin") {
      return this.hasPermission(actor, `${action}:tenant` as Permission, _tenantId);
    }

    if (actor.role === "manager") {
      if (actor.propertyIds === null) {
        return this.hasPermission(actor, `${action}:assigned` as Permission, _tenantId);
      }
      return actor.propertyIds.includes(propertyId);
    }

    return false;
  }

  assertPermission(
    actor: ActorContext,
    permission: Permission,
    tenantId: string,
  ): void {
    if (!this.hasPermission(actor, permission, tenantId)) {
      throw new ForbiddenError();
    }
  }

  private matchPermission(
    granted: readonly Permission[],
    required: Permission,
  ): boolean {
    if (granted.includes(required)) {
      return true;
    }

    const [resource, action, scope] = required.split(":") as [
      string,
      string,
      PermissionScope,
    ];

    const tenantWildcard = `${resource}:${action}:tenant` as Permission;
    if (scope === "assigned" && granted.includes(tenantWildcard)) {
      return true;
    }

    return false;
  }
}

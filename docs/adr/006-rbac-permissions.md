# ADR-006: Role-Based Access Control (RBAC)

## Status
Accepted

## Context
Multi-tenant admin requires fine-grained authorization: platform super admins, tenant admins with full tenant scope, and managers with property-scoped access.

## Decision
Implement RBAC in `@hcp/permissions` with:
- Permission strings `{resource}:{action}:{scope}` (e.g. `property:update:tenant`)
- Role-to-permission maps for `admin` and `manager`
- Explicit `SUPER_ADMIN_PERMISSIONS` list (no wildcard bypass)
- `PermissionChecker` domain service enforcing permissions and property scope in use cases

## Consequences
- All mutating use cases accept `ActorContext` and call `PermissionChecker` before repository access
- Route handlers never perform authorization logic directly
- Manager property scope enforced via `propertyIds` on membership and `canAccessProperty`

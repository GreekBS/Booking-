/**
 * UX-only dashboard gate for platform Super Admins.
 *
 * Privilege is NOT decided here — requireSession / requireSuperAdmin /
 * requireTenantContext remain the security authority (DB platformRole).
 *
 * `platformRole` should be the DB-authoritative value from requireSession.
 * `activeTenantId` is JWT session selection state.
 */
export function shouldRedirectSuperAdminToPlatform(params: {
  platformRole: "super_admin" | null;
  activeTenantId: string | null | undefined;
}): boolean {
  return params.platformRole === "super_admin" && !params.activeTenantId;
}

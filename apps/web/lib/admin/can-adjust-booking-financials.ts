import type { MeProfile } from "@/lib/admin/types";

/**
 * Client UX gate for booking financial reprice.
 * Authoritative denial remains on the API (`booking:financial_adjust:tenant`).
 * Managers and other non-admin memberships must not see a working CTA.
 */
export function canAdjustBookingFinancials(
  profile: MeProfile | null | undefined,
  tenantId: string | null | undefined,
): boolean {
  // Tenant context is required even for platform super-admins — API calls are
  // tenant-scoped and must not expose a stale CTA without an active tenant.
  if (!profile || !tenantId) return false;
  if (profile.user.platformRole === "super_admin") return true;
  const membership = profile.memberships.find((m) => m.tenantId === tenantId);
  return membership?.role === "admin";
}

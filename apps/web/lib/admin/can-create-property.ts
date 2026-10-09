import type { MeProfile } from "@/lib/admin/types";

/**
 * Client UX gate for Create Property. Authoritative denial remains on the API
 * (`property:create:tenant`). Managers must not see a working create CTA.
 */
export function canCreateProperty(
  profile: MeProfile | null | undefined,
  tenantId: string | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.user.platformRole === "super_admin") return true;
  if (!tenantId) return false;
  const membership = profile.memberships.find((m) => m.tenantId === tenantId);
  return membership?.role === "admin";
}

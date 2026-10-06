/**
 * Browser-safe hk_staff capability types/constants.
 * HMAC signing lives in HmacHkStaffCapabilitySigner (not barrel-exported).
 */

export const HK_STAFF_CAPABILITY_TYP = "hk_staff" as const;
export const HK_STAFF_CAPABILITY_TTL_SECONDS = 30 * 60; // 30 minutes
export const HK_STAFF_COOKIE_NAME = "talos_hk_staff";

export interface HkStaffCapabilityClaims {
  typ: typeof HK_STAFF_CAPABILITY_TYP;
  v: 1;
  tenantId: string;
  propertyId: string;
  locationId: string;
  unitId: string | null;
  qrAccessId: string;
  /** SHA-256 hex of the opaque QR token — rotate invalidates capability. */
  tokenHash: string;
  iat: number;
  exp: number;
}

export interface IHkStaffCapabilitySigner {
  issue(
    input: Omit<HkStaffCapabilityClaims, "typ" | "v" | "iat" | "exp"> & {
      now?: Date;
      ttlSeconds?: number;
    },
  ): { token: string; claims: HkStaffCapabilityClaims };
  verify(token: string, now?: Date): HkStaffCapabilityClaims | null;
}

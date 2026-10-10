export const BULK_RATE_PLAN_CONFIRM_TYP = "bulk_rate_plan_apply" as const;
export const BULK_RATE_PLAN_CONFIRM_TTL_SECONDS = 15 * 60;

export type BulkRatePlanPropagateMode = "skip_customized" | "overwrite_all";

/** Per-target fingerprint at preview time; "missing" when no RatePlan exists. */
export type TargetRateFingerprint = string | "missing";

export interface BulkRatePlanConfirmClaims {
  typ: typeof BULK_RATE_PLAN_CONFIRM_TYP;
  v: 1;
  tenantId: string;
  propertyId: string;
  sourceUnitId: string;
  roomTypeId: string;
  targetUnitIds: string[];
  mode: BulkRatePlanPropagateMode;
  sourceFingerprint: string;
  /** Sorted target ids → fingerprint or "missing". */
  targetFingerprints: Record<string, TargetRateFingerprint>;
  /** Targets that will receive a write (create or overwrite). */
  applyUnitIds: string[];
  /** Targets skipped (identical or protected). */
  skipUnitIds: string[];
  actorId: string;
  iat: number;
  exp: number;
}

export interface IBulkRatePlanConfirmTokenService {
  issue(claims: Omit<BulkRatePlanConfirmClaims, "typ" | "v" | "iat" | "exp"> & {
    now?: Date;
    ttlSeconds?: number;
  }): { token: string; claims: BulkRatePlanConfirmClaims };

  verify(token: string, now?: Date): BulkRatePlanConfirmClaims | null;
}

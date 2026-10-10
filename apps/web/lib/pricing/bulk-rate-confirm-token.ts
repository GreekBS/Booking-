import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BULK_RATE_PLAN_CONFIRM_TTL_SECONDS,
  BULK_RATE_PLAN_CONFIRM_TYP,
  type BulkRatePlanConfirmClaims,
  type IBulkRatePlanConfirmTokenService,
} from "@hcp/domain";

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function resolveSecret(env: NodeJS.ProcessEnv = process.env): string {
  const dedicated = env.BULK_RATE_PLAN_CONFIRM_SECRET?.trim();
  if (dedicated && dedicated.length >= 16) return dedicated;
  const auth = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();
  if (auth && auth.length >= 16) {
    return `talos-bulk-rate-plan-v1:${auth}`;
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "BULK_RATE_PLAN_CONFIRM_SECRET or AUTH_SECRET is required for bulk rate confirmation",
    );
  }
  return "talos-bulk-rate-plan-dev-secret";
}

/**
 * HMAC-SHA256 confirmation tokens for C3-H2c bulk RatePlan apply.
 * Server-only — never import from client components.
 */
export class HmacBulkRatePlanConfirmTokenService
  implements IBulkRatePlanConfirmTokenService
{
  constructor(private readonly secret: string = resolveSecret()) {
    if (!this.secret || this.secret.length < 16) {
      throw new Error("Bulk rate confirm secret is missing or too short");
    }
  }

  issue(
    input: Omit<BulkRatePlanConfirmClaims, "typ" | "v" | "iat" | "exp"> & {
      now?: Date;
      ttlSeconds?: number;
    },
  ): { token: string; claims: BulkRatePlanConfirmClaims } {
    const now = input.now ?? new Date();
    const iat = Math.floor(now.getTime() / 1000);
    const ttl = input.ttlSeconds ?? BULK_RATE_PLAN_CONFIRM_TTL_SECONDS;
    const claims: BulkRatePlanConfirmClaims = {
      typ: BULK_RATE_PLAN_CONFIRM_TYP,
      v: 1,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      sourceUnitId: input.sourceUnitId,
      roomTypeId: input.roomTypeId,
      targetUnitIds: [...input.targetUnitIds].sort(),
      mode: input.mode,
      sourceFingerprint: input.sourceFingerprint,
      targetFingerprints: { ...input.targetFingerprints },
      applyUnitIds: [...input.applyUnitIds].sort(),
      skipUnitIds: [...input.skipUnitIds].sort(),
      actorId: input.actorId,
      iat,
      exp: iat + ttl,
    };
    const payload = b64url(Buffer.from(JSON.stringify(claims), "utf8"));
    const sig = b64url(
      createHmac("sha256", this.secret).update(payload).digest(),
    );
    return { token: `${payload}.${sig}`, claims };
  }

  verify(token: string, now: Date = new Date()): BulkRatePlanConfirmClaims | null {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    if (!payload || !sig) return null;

    const expected = b64url(
      createHmac("sha256", this.secret).update(payload).digest(),
    );
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }

    let claims: BulkRatePlanConfirmClaims;
    try {
      claims = JSON.parse(fromB64url(payload).toString("utf8")) as BulkRatePlanConfirmClaims;
    } catch {
      return null;
    }

    if (
      claims.typ !== BULK_RATE_PLAN_CONFIRM_TYP ||
      claims.v !== 1 ||
      typeof claims.tenantId !== "string" ||
      typeof claims.propertyId !== "string" ||
      typeof claims.sourceUnitId !== "string" ||
      typeof claims.actorId !== "string" ||
      typeof claims.exp !== "number"
    ) {
      return null;
    }

    if (Math.floor(now.getTime() / 1000) > claims.exp) {
      return null;
    }

    return claims;
  }
}

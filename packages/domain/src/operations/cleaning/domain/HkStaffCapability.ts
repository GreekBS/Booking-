import { createHmac, timingSafeEqual } from "node:crypto";

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

/**
 * HMAC-SHA256 signed capability (not Auth.js). Stateless; scope enforced on every use.
 */
export class HmacHkStaffCapabilitySigner implements IHkStaffCapabilitySigner {
  constructor(private readonly secret: string) {
    if (!secret || secret.length < 16) {
      throw new Error("HK staff capability secret is missing or too short");
    }
  }

  issue(
    input: Omit<HkStaffCapabilityClaims, "typ" | "v" | "iat" | "exp"> & {
      now?: Date;
      ttlSeconds?: number;
    },
  ): { token: string; claims: HkStaffCapabilityClaims } {
    const now = input.now ?? new Date();
    const iat = Math.floor(now.getTime() / 1000);
    const ttl = input.ttlSeconds ?? HK_STAFF_CAPABILITY_TTL_SECONDS;
    const claims: HkStaffCapabilityClaims = {
      typ: HK_STAFF_CAPABILITY_TYP,
      v: 1,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      locationId: input.locationId,
      unitId: input.unitId,
      qrAccessId: input.qrAccessId,
      tokenHash: input.tokenHash.toLowerCase(),
      iat,
      exp: iat + ttl,
    };
    const payload = b64url(Buffer.from(JSON.stringify(claims), "utf8"));
    const sig = b64url(
      createHmac("sha256", this.secret).update(payload).digest(),
    );
    return { token: `${payload}.${sig}`, claims };
  }

  verify(token: string, now: Date = new Date()): HkStaffCapabilityClaims | null {
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

    let claims: HkStaffCapabilityClaims;
    try {
      claims = JSON.parse(fromB64url(payload).toString("utf8")) as HkStaffCapabilityClaims;
    } catch {
      return null;
    }

    if (
      claims.typ !== HK_STAFF_CAPABILITY_TYP ||
      claims.v !== 1 ||
      typeof claims.tenantId !== "string" ||
      typeof claims.propertyId !== "string" ||
      typeof claims.locationId !== "string" ||
      typeof claims.qrAccessId !== "string" ||
      typeof claims.tokenHash !== "string" ||
      typeof claims.exp !== "number" ||
      typeof claims.iat !== "number"
    ) {
      return null;
    }

    const nowSec = Math.floor(now.getTime() / 1000);
    if (claims.exp <= nowSec) {
      return null;
    }

    return claims;
  }
}

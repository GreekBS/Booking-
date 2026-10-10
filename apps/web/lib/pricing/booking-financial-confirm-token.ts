import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BOOKING_FINANCIAL_CONFIRM_TTL_SECONDS,
  BOOKING_FINANCIAL_CONFIRM_TYP,
  type BookingFinancialConfirmClaims,
  type IBookingFinancialConfirmTokenService,
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
  const dedicated = env.BOOKING_FINANCIAL_CONFIRM_SECRET?.trim();
  if (dedicated && dedicated.length >= 16) return dedicated;
  const auth = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();
  if (auth && auth.length >= 16) {
    return `talos-booking-financial-v1:${auth}`;
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "BOOKING_FINANCIAL_CONFIRM_SECRET or AUTH_SECRET is required for booking financial confirmation",
    );
  }
  return "talos-booking-financial-dev-secret";
}

/**
 * HMAC-SHA256 confirmation tokens for BFS-2 booking financial reprice preview.
 * Server-only — never import from client components.
 */
export class HmacBookingFinancialConfirmTokenService
  implements IBookingFinancialConfirmTokenService
{
  constructor(private readonly secret: string = resolveSecret()) {
    if (!this.secret || this.secret.length < 16) {
      throw new Error("Booking financial confirm secret is missing or too short");
    }
  }

  issue(
    input: Omit<BookingFinancialConfirmClaims, "typ" | "v" | "iat" | "exp"> & {
      now?: Date;
      ttlSeconds?: number;
    },
  ): { token: string; claims: BookingFinancialConfirmClaims } {
    const now = input.now ?? new Date();
    const iat = Math.floor(now.getTime() / 1000);
    const ttl = input.ttlSeconds ?? BOOKING_FINANCIAL_CONFIRM_TTL_SECONDS;
    const claims: BookingFinancialConfirmClaims = {
      typ: BOOKING_FINANCIAL_CONFIRM_TYP,
      v: 1,
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      bookingId: input.bookingId,
      actorId: input.actorId,
      pricingIntent: "recalculate_from_rate_plan",
      currentQuoteId: input.currentQuoteId,
      currentSnapshotId: input.currentSnapshotId,
      currentTotalAmount: input.currentTotalAmount,
      currency: input.currency,
      unitId: input.unitId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guestCount: input.guestCount,
      proposedTotalAmount: input.proposedTotalAmount,
      proposedSubtotalAmount: input.proposedSubtotalAmount,
      proposedFeesAmount: input.proposedFeesAmount,
      proposedTaxesAmount: input.proposedTaxesAmount,
      proposedDiscountAmount: input.proposedDiscountAmount,
      pricingFingerprint: input.pricingFingerprint,
      reasonHash: input.reasonHash,
      iat,
      exp: iat + ttl,
    };
    const payload = b64url(Buffer.from(JSON.stringify(claims), "utf8"));
    const sig = b64url(
      createHmac("sha256", this.secret).update(payload).digest(),
    );
    return { token: `${payload}.${sig}`, claims };
  }

  verify(token: string, now: Date = new Date()): BookingFinancialConfirmClaims | null {
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

    let claims: BookingFinancialConfirmClaims;
    try {
      claims = JSON.parse(
        fromB64url(payload).toString("utf8"),
      ) as BookingFinancialConfirmClaims;
    } catch {
      return null;
    }

    if (
      claims.typ !== BOOKING_FINANCIAL_CONFIRM_TYP ||
      claims.v !== 1 ||
      claims.pricingIntent !== "recalculate_from_rate_plan" ||
      typeof claims.tenantId !== "string" ||
      typeof claims.propertyId !== "string" ||
      typeof claims.bookingId !== "string" ||
      typeof claims.actorId !== "string" ||
      typeof claims.pricingFingerprint !== "string" ||
      typeof claims.reasonHash !== "string" ||
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

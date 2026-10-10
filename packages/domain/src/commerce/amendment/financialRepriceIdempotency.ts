import {
  encodeUtf8,
  sha256Bytes,
  sha256HexUtf8,
} from "../../channels/utils/sha256Hex";
import type { BookingCommercialAmendment } from "./BookingCommercialAmendment";
import type { BookingFinancialConfirmClaims } from "../application/BookingFinancialConfirmToken";

/**
 * Stable idempotency / confirmation reference derived from the signed token.
 * Never log the raw token; only this digest may be persisted.
 */
export function deriveFinancialRepriceConfirmationReference(
  confirmationToken: string,
): string {
  return sha256HexUtf8(confirmationToken);
}

/** Deterministic UUID (v4-shaped) for folio adjustment line dedupe. */
export function deterministicFinancialRepriceLineId(
  amendmentId: string,
): string {
  const h = sha256Bytes(encodeUtf8(`bfs3b2:commercial_delta:${amendmentId}`));
  const bytes = Uint8Array.from(h.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Replay match: existing amendment must equal the confirmed preview claims
 * (booking already points at newQuote after first success).
 */
export function amendmentMatchesFinancialRepriceClaims(
  existing: BookingCommercialAmendment,
  input: {
    claims: BookingFinancialConfirmClaims;
    reason: string;
    confirmationReference: string;
    idempotencyKey: string;
  },
): boolean {
  return (
    existing.tenantId === input.claims.tenantId &&
    existing.propertyId === input.claims.propertyId &&
    existing.bookingId === input.claims.bookingId &&
    existing.previousQuoteId === input.claims.currentQuoteId &&
    existing.previousTotalAmount === input.claims.currentTotalAmount &&
    existing.newTotalAmount === input.claims.proposedTotalAmount &&
    existing.currency === input.claims.currency &&
    existing.pricingIntent === "recalculate_from_rate_plan" &&
    existing.reason === input.reason &&
    existing.actorId === input.claims.actorId &&
    existing.mutationOrigin === "operator" &&
    existing.confirmationReference === input.confirmationReference &&
    existing.idempotencyKey === input.idempotencyKey &&
    existing.pricingFingerprint === input.claims.pricingFingerprint
  );
}

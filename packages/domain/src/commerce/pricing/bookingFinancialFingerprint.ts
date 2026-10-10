import { sha256HexUtf8 } from "../../channels/utils/sha256Hex";
import type { NightlyLineItem } from "./PricingCalculator";
import { ratePlanContentFingerprint } from "./ratePlanContentFingerprint";
import type { RatePlanProps } from "../shared/types/CommerceTypes";

export interface BookingProposedCommercialFingerprintInput {
  ratePlan: RatePlanProps;
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  subtotalAmount: string;
  feesAmount: string;
  taxesAmount: string;
  discountAmount: string;
  totalAmount: string;
  currency: string;
  lineItems: readonly NightlyLineItem[];
}

/**
 * Canonical fingerprint for BFS-2 confirmation tokens.
 * Binds RatePlan content + proposed stay geometry + commercial totals.
 */
export function bookingProposedCommercialFingerprint(
  input: BookingProposedCommercialFingerprintInput,
): string {
  const nights = [...input.lineItems]
    .map((n) => ({
      date: n.date,
      baseAmount: n.baseAmount,
      adjustedAmount: n.adjustedAmount,
      currency: n.currency,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return sha256HexUtf8(
    JSON.stringify({
      v: 1,
      ratePlanFingerprint: ratePlanContentFingerprint(input.ratePlan),
      unitId: input.unitId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guestCount: input.guestCount,
      subtotalAmount: input.subtotalAmount,
      feesAmount: input.feesAmount,
      taxesAmount: input.taxesAmount,
      discountAmount: input.discountAmount,
      totalAmount: input.totalAmount,
      currency: input.currency.trim().toUpperCase(),
      nights,
    }),
  );
}

export function hashFinancialReason(reason: string): string {
  return sha256HexUtf8(reason.trim());
}

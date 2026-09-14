export type HoldStatus = "active" | "released" | "expired" | "converted";

export type BookingStatus =
  | "pending"
  | "payment_pending"
  | "confirmed"
  | "cancelled"
  | "completed";

export type CalendarBlockType =
  | "manual"
  | "maintenance"
  | "cleaning"
  | "owner"
  | "hold"
  | "booking"
  | "turnover"
  | "channel_import";

/** Operator-created inventory blocks that can be released from the admin calendar. */
export const OPERATOR_BLOCK_TYPES = [
  "manual",
  "maintenance",
  "cleaning",
  "owner",
] as const;

export type OperatorBlockType = (typeof OPERATOR_BLOCK_TYPES)[number];

export function isOperatorBlockType(type: CalendarBlockType): type is OperatorBlockType {
  return (OPERATOR_BLOCK_TYPES as readonly string[]).includes(type);
}

export type CalendarBlockStatus = "active" | "released" | "expired" | "cancelled";

export type DowModifierType = "fixed" | "percent";

export type ConfirmationMode = "manual" | "payment_required";

export interface AvailabilityReason {
  code: string;
  message: string;
}

export interface ActiveCalendarBlock {
  blockType: CalendarBlockType;
  status: CalendarBlockStatus;
  checkIn: string;
  checkOut: string;
  sourceId: string | null;
}

export interface CalendarBlockView extends ActiveCalendarBlock {
  id: string;
  unitId: string;
  sourceId: string | null;
  reason: string | null;
  expiresAt: string | null;
}

export interface UnitAvailabilityRulesProps {
  minNights: number;
  maxNights: number;
  checkInDays: number[];
  checkOutDays: number[];
  advanceMinDays: number;
  advanceMaxDays: number;
  turnoverNights: number;
}

export interface RateSeasonProps {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  nightlyAmount: string;
}

export interface DowModifierProps {
  dayOfWeek: number;
  modifierType: DowModifierType;
  modifierValue: string;
}

export interface LosDiscountProps {
  minNights: number;
  percentOff: string;
}

export interface RatePlanProps {
  baseNightlyAmount: string;
  currency: string;
  seasons: RateSeasonProps[];
  dowModifiers: DowModifierProps[];
  losDiscounts: LosDiscountProps[];
}

export interface GuestDetailsProps {
  name: string;
  email: string;
  phone: string | null;
}

export const DEFAULT_HOLD_TTL_SECONDS = 900;

export const SNAPSHOT_VERSION = 1;

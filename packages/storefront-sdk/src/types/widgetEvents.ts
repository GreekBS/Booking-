export type WidgetEvent =
  | { type: "ready"; version: string }
  | {
      type: "dates_selected";
      checkIn: string;
      checkOut: string;
      guestCount: number;
    }
  | {
      type: "availability_checked";
      available: boolean;
      reasons?: string[];
    }
  | { type: "price_updated"; total: string; currency: string }
  | { type: "hold_created"; holdId: string; expiresAt: string }
  | { type: "hold_expired" }
  | { type: "guest_step" }
  | { type: "booking_submitted" }
  | {
      type: "booking_completed";
      confirmationCode: string;
      bookingId: string;
    }
  | { type: "error"; code: string; message: string };

export const WIDGET_EVENT_TYPES = [
  "ready",
  "dates_selected",
  "availability_checked",
  "price_updated",
  "hold_created",
  "hold_expired",
  "guest_step",
  "booking_submitted",
  "booking_completed",
  "error",
] as const;

export type WidgetEventType = (typeof WIDGET_EVENT_TYPES)[number];

export function isWidgetEvent(value: unknown): value is WidgetEvent {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }
  const type = (value as { type: unknown }).type;
  return typeof type === "string" && WIDGET_EVENT_TYPES.includes(type as WidgetEventType);
}

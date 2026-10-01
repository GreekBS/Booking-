import { z } from "zod";

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const directBookingPublicKeySchema = z
  .string()
  .regex(/^dbk_(test|live)_[A-Za-z0-9]{16,64}$/);

export const createDirectBookingIntegrationSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  environment: z.enum(["test", "live"]).default("live"),
  allowedOrigins: z.array(z.string().min(1).max(253)).max(20).default([]),
  status: z.enum(["draft", "active", "disabled"]).optional(),
});

export const updateDirectBookingIntegrationStatusSchema = z.object({
  status: z.enum(["draft", "active", "disabled"]),
});

export const directBookingAvailabilitySchema = z
  .object({
    checkIn: localDateSchema,
    checkOut: localDateSchema,
    guestCount: z.number().int().min(1).max(50),
  })
  .strict();

/** Clients must not submit prices — unknown keys (total, nightlyRate, …) are rejected. */
export const directBookingQuoteSchema = z
  .object({
    checkIn: localDateSchema,
    checkOut: localDateSchema,
    guestCount: z.number().int().min(1).max(50),
  })
  .strict();

/** Public Direct Booking Hold — stay only; no price/TTL/tenant/unit overrides. */
export const directBookingCreateHoldSchema = z
  .object({
    checkIn: localDateSchema,
    checkOut: localDateSchema,
    guestCount: z.number().int().min(1).max(50),
    idempotencyKey: z.string().min(8).max(64),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!(value.checkIn < value.checkOut)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "checkOut must be after checkIn",
        path: ["checkOut"],
      });
    }
  });

/**
 * Public Direct Booking book — Hold + guest only.
 * Stay/price/status come from Hold + persisted Quote; specialRequests deferred (no Booking notes column).
 */
export const directBookingCreateBookSchema = z
  .object({
    holdId: z.string().uuid(),
    guest: z
      .object({
        firstName: z.string().trim().min(1).max(100),
        lastName: z.string().trim().min(1).max(100),
        email: z.string().trim().email().max(255),
        phone: z.string().trim().min(1).max(50),
        country: z
          .string()
          .trim()
          .regex(/^[A-Za-z]{2}$/, "country must be ISO 3166-1 alpha-2")
          .transform((value) => value.toUpperCase()),
      })
      .strict(),
    acceptedTerms: z.literal(true),
    idempotencyKey: z.string().min(8).max(64),
  })
  .strict();

/** Max [from, to) span in days for public Direct Booking calendar browsing. */
export const DIRECT_BOOKING_CALENDAR_MAX_RANGE_DAYS = 93;

export const directBookingCalendarSchema = z
  .object({
    from: localDateSchema,
    to: localDateSchema,
    guestCount: z.number().int().min(1).max(50),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!(value.from < value.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "to must be after from",
        path: ["to"],
      });
      return;
    }
    const fromMs = Date.parse(`${value.from}T00:00:00.000Z`);
    const toMs = Date.parse(`${value.to}T00:00:00.000Z`);
    const days = Math.round((toMs - fromMs) / 86_400_000);
    if (days > DIRECT_BOOKING_CALENDAR_MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Calendar range exceeds maximum of ${DIRECT_BOOKING_CALENDAR_MAX_RANGE_DAYS} days`,
        path: ["to"],
      });
    }
  });

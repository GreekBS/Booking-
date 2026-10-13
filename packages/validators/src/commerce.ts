import { z } from "zod";
import { paginationSchema } from "./pagination";

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const checkAvailabilitySchema = z.object({
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  guestCount: z.number().int().min(1).max(50),
});

export const createManualBlockSchema = z.object({
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  blockType: z
    .enum(["manual", "maintenance", "cleaning", "owner"])
    .default("manual"),
  reason: z.string().max(500).nullable().optional(),
});

export const calendarQuerySchema = z
  .object({
    from: localDateSchema,
    to: localDateSchema,
  })
  .refine((value) => value.from < value.to, {
    message: "from must be before to",
    path: ["to"],
  });

/** Max units per Availability calendar batch request (UI loads one property's units). */
export const CALENDAR_BATCH_MAX_UNITS = 100;

/**
 * Max inclusive span for calendar batch [from, to) in days.
 * Covers ~13 months of month-grid "load more" without allowing multi-year dumps.
 */
export const CALENDAR_BATCH_MAX_RANGE_DAYS = 400;

function calendarRangeDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000);
}

export const calendarBatchRequestSchema = z
  .object({
    unitIds: z
      .array(z.string().uuid())
      .min(1)
      .max(CALENDAR_BATCH_MAX_UNITS),
    from: localDateSchema,
    to: localDateSchema,
  })
  .superRefine((value, ctx) => {
    if (value.from >= value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "from must be before to",
        path: ["to"],
      });
    }
    const days = calendarRangeDays(value.from, value.to);
    if (days > CALENDAR_BATCH_MAX_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Date range must be at most ${CALENDAR_BATCH_MAX_RANGE_DAYS} days`,
        path: ["to"],
      });
    }
  });

export const unitIdsBatchRequestSchema = z.object({
  unitIds: z
    .array(z.string().uuid())
    .min(1)
    .max(CALENDAR_BATCH_MAX_UNITS),
});

export const createHoldSchema = z.object({
  unitId: z.string().uuid(),
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  guestCount: z.number().int().min(1).max(50),
  sessionRef: z.string().max(64).nullable().optional(),
});

export const createQuoteSchema = z.object({
  holdId: z.string().uuid(),
});

export const createBookingSchema = z.object({
  quoteId: z.string().uuid(),
  guest: z.object({
    name: z.string().min(1).max(255),
    email: z.string().email(),
    phone: z.string().max(50).nullable().optional(),
  }),
  confirmationMode: z.enum(["manual", "payment_required"]).optional(),
  /**
   * Explicit operator opt-in to leave booking pending (on hold).
   * Default omitted/false → newly accepted bookings are confirmed.
   */
  operatorHold: z.boolean().optional(),
  /** Explicit operator-selected Guest (admin). Storefront must not send this. */
  guestId: z.string().uuid().nullable().optional(),
});

export const bookingPricingIntentSchema = z.enum([
  "preserve_agreed_total",
  "recalculate_from_rate_plan",
  "manual_total",
]);

export const changeBookingStaySchema = z.object({
  unitId: z.string().uuid(),
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  guestCount: z.number().int().min(1).max(50),
  /** Optional; server defaults to preserve_agreed_total and rejects unsafe intents. */
  pricingIntent: bookingPricingIntentSchema.optional(),
});

/** BFS-2 — read-only RatePlan reprice preview + confirmation token. */
export const previewBookingFinancialRepriceSchema = z
  .object({
    unitId: z.string().uuid(),
    checkIn: localDateSchema,
    checkOut: localDateSchema,
    guestCount: z.number().int().min(1).max(50),
    reason: z.string().trim().min(3).max(500),
  })
  .refine((value) => value.checkIn < value.checkOut, {
    message: "checkIn must be before checkOut",
    path: ["checkOut"],
  });

/**
 * BFS-2 — validate confirmation then reject until BFS-3.
 * Client-supplied totals are intentionally absent.
 */
export const applyBookingFinancialRepriceSchema = z.object({
  confirmationToken: z.string().trim().min(16).max(8192),
  reason: z.string().trim().min(3).max(500),
});

export const previewStayPricingSchema = z
  .object({
    unitId: z.string().uuid(),
    checkIn: localDateSchema,
    checkOut: localDateSchema,
    guestCount: z.number().int().min(1).max(50).optional(),
  })
  .refine((value) => value.checkIn < value.checkOut, {
    message: "checkIn must be before checkOut",
    path: ["checkOut"],
  });

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const expireHoldsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const availabilityRulesSchema = z.object({
  minNights: z.number().int().min(1).max(365),
  maxNights: z.number().int().min(1).max(365),
  checkInDays: z.array(z.number().int().min(0).max(6)),
  checkOutDays: z.array(z.number().int().min(0).max(6)),
  advanceMinDays: z.number().int().min(0).max(365),
  advanceMaxDays: z.number().int().min(0).max(730),
  turnoverNights: z.number().int().min(0).max(30),
});

const decimalMoneySchema = z.string().regex(/^\d+\.\d{4}$/);

export const rateSeasonSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  startDate: localDateSchema,
  endDate: localDateSchema,
  nightlyAmount: decimalMoneySchema,
});

export const dowModifierSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  modifierType: z.enum(["fixed", "percent"]),
  modifierValue: decimalMoneySchema,
});

export const ratePlanSchema = z.object({
  baseNightlyAmount: decimalMoneySchema,
  currency: z.string().length(3),
  seasons: z.array(rateSeasonSchema).default([]),
  dowModifiers: z.array(dowModifierSchema).default([]),
  losDiscounts: z
    .array(
      z.object({
        minNights: z.number().int().min(2),
        percentOff: decimalMoneySchema,
      }),
    )
    .default([]),
});

/** C3-H2c — bulk RatePlan copy from a template Unit. */
export const bulkRatePlanPropagateModeSchema = z.enum([
  "skip_customized",
  "overwrite_all",
]);

export const previewBulkRatePlanFromTemplateSchema = z
  .object({
    sourceUnitId: z.string().uuid(),
    targetUnitIds: z.array(z.string().uuid()).min(1).max(500).optional(),
    roomTypeId: z.string().uuid().optional(),
    mode: bulkRatePlanPropagateModeSchema.default("skip_customized"),
  })
  .superRefine((value, ctx) => {
    const hasTargets = (value.targetUnitIds?.length ?? 0) > 0;
    const hasRoomType = Boolean(value.roomTypeId);
    if (hasTargets === hasRoomType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of targetUnitIds or roomTypeId",
        path: hasTargets ? ["roomTypeId"] : ["targetUnitIds"],
      });
    }
  });

export const applyBulkRatePlanFromTemplateSchema = z.object({
  confirmationToken: z.string().trim().min(16).max(8192),
  confirmOverwrite: z.boolean().optional(),
});

export const listBookingsQuerySchema = paginationSchema.extend({
  unitId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  status: z.enum(["pending", "confirmed", "cancelled", "completed"]).optional(),
  checkInFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkInTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOutFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOutTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  guestSearch: z.string().max(255).optional(),
  // Default: newest bookings first (createdAt desc). Operators may override via sortBy.
  sortBy: z.enum(["checkIn", "checkOut", "guestName", "status", "createdAt"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

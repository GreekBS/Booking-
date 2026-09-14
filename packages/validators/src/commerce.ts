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
});

export const changeBookingStaySchema = z.object({
  unitId: z.string().uuid(),
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  guestCount: z.number().int().min(1).max(50),
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

export const listBookingsQuerySchema = paginationSchema.extend({
  unitId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  status: z.enum(["pending", "confirmed", "cancelled", "completed"]).optional(),
  checkInFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkInTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOutFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOutTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  guestSearch: z.string().max(255).optional(),
  sortBy: z.enum(["checkIn", "checkOut", "guestName", "status", "createdAt"]).default("checkIn"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

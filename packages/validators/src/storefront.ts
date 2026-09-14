import { z } from "zod";

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const storefrontAvailabilityCheckSchema = z.object({
  unitId: z.string().uuid(),
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  guestCount: z.number().int().min(1).max(50),
});

export const storefrontCreateHoldSchema = z.object({
  unitId: z.string().uuid(),
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  guestCount: z.number().int().min(1).max(50),
  sessionId: z.string().max(64).optional(),
});

export const storefrontCreateQuoteSchema = z.object({
  holdId: z.string().uuid(),
});

export const storefrontCreateBookingSchema = z.object({
  quoteId: z.string().uuid(),
  guest: z.object({
    name: z.string().min(1).max(255),
    email: z.string().email(),
    phone: z.string().max(50).nullable().optional(),
  }),
});

export const idempotencyKeyHeaderSchema = z.string().min(8).max(64);

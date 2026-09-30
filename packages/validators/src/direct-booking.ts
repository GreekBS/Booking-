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

import { z } from "zod";

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const stayQuerySchema = z.object({
  checkIn: localDate,
  checkOut: localDate,
  guestCount: z.number().int().min(1),
});

export const createHoldRequestSchema = stayQuerySchema.extend({
  unitId: z.string().min(1),
  sessionId: z.string().optional(),
});

export const createQuoteRequestSchema = z.object({
  holdId: z.string().min(1),
});

export const guestContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
});

export const createBookingRequestSchema = z.object({
  quoteId: z.string().min(1),
  guest: guestContactSchema,
});

export const searchAvailabilityRequestSchema = stayQuerySchema.extend({
  propertySlug: z.string().optional(),
});

export const publishableKeySchema = z
  .string()
  .regex(/^pk_(test|live)_[A-Za-z0-9]{16,64}$/);

export const themeColorsSchema = z.object({
  primary: z.string().min(1),
  primaryForeground: z.string().min(1),
  background: z.string().min(1),
  foreground: z.string().min(1),
  muted: z.string().min(1),
  border: z.string().min(1),
  success: z.string().min(1),
  error: z.string().min(1),
});

export const themeConfigSchema = z.object({
  preset: z.enum(["light", "dark", "minimal"]).optional(),
  colors: themeColorsSchema,
  typography: z
    .object({
      fontFamily: z.string().optional(),
      fontFamilyHeading: z.string().optional(),
      baseFontSize: z.string().optional(),
    })
    .default({}),
  radius: z.object({
    sm: z.string(),
    md: z.string(),
    lg: z.string(),
  }),
  spacing: z.object({ unit: z.number().positive() }).optional(),
  logoUrl: z.string().url().optional(),
});

export const publicHoldSchema = z.object({
  id: z.string().min(1),
  unitId: z.string().min(1),
  checkIn: localDate,
  checkOut: localDate,
  guestCount: z.number().int().min(1),
  expiresAt: z.string().datetime(),
});

export const publicQuoteSchema = z.object({
  id: z.string().min(1),
  holdId: z.string().min(1),
  expiresAt: z.string().datetime(),
  snapshot: z.object({
    checkIn: localDate,
    checkOut: localDate,
    currency: z.string().length(3),
    lineItems: z.array(
      z.object({
        date: localDate,
        amount: z.string(),
        currency: z.string().length(3),
      }),
    ),
    subtotal: z.string(),
    fees: z.string(),
    taxes: z.string(),
    total: z.string(),
  }),
});

export const publicBookingSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["pending", "payment_pending", "confirmed", "cancelled", "completed"]),
  confirmationCode: z.string().min(1),
  checkIn: localDate,
  checkOut: localDate,
  guest: guestContactSchema,
});

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

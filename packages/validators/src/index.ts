import { z } from "zod";
import { paginationSchema } from "./pagination";

export { paginationSchema } from "./pagination";

export const createTenantSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  timezone: z.string().optional(),
  defaultLocale: z.string().optional(),
  defaultCurrency: z.string().length(3).optional(),
  adminEmail: z.string().email().optional(),
  adminName: z.string().min(2).max(255).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  timezone: z.string().optional(),
  defaultLocale: z.string().optional(),
  defaultCurrency: z.string().length(3).optional(),
});

export const createPropertySchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  description: z.string().nullable().optional(),
  type: z.enum(["villa", "apartment", "hotel", "other"]).optional(),
  timezone: z.string().optional(),
  maxGuests: z.number().int().min(1).max(50).optional(),
});

export const updatePropertySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().nullable().optional(),
  type: z.enum(["villa", "apartment", "hotel", "other"]).optional(),
  status: z.enum(["draft", "active", "inactive", "archived"]).optional(),
  timezone: z.string().optional(),
  location: z
    .object({
      addressLine: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      region: z.string().nullable().optional(),
      postalCode: z.string().nullable().optional(),
      country: z.string().length(2).nullable().optional(),
      latitude: z.number().nullable().optional(),
      longitude: z.number().nullable().optional(),
    })
    .optional(),
  policies: z
    .object({
      checkInTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      cancellationPolicyType: z.enum(["flexible", "moderate", "strict"]).optional(),
    })
    .optional(),
  amenityIds: z.array(z.string().uuid()).optional(),
});

export const createUnitSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  maxGuests: z.number().int().min(1).max(50),
  bedrooms: z.number().int().min(0).max(20).optional(),
  bathrooms: z.number().int().min(0).max(20).optional(),
});

export const updateUnitSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  maxGuests: z.number().int().min(1).max(50).optional(),
  bedrooms: z.number().int().min(0).max(20).optional(),
  bathrooms: z.number().int().min(0).max(20).optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
});

export const createAmenitySchema = z.object({
  name: z.string().min(2).max(100),
  icon: z.string().max(50).optional(),
  category: z.string().max(50).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager"]),
  propertyIds: z.array(z.string().uuid()).nullable().optional(),
});

export const updateMemberSchema = z.object({
  role: z.enum(["admin", "manager"]).optional(),
  propertyIds: z.array(z.string().uuid()).nullable().optional(),
});

export const acceptInvitationSchema = z.object({
  name: z.string().min(2).max(255),
  password: z.string().min(8).max(128).optional(),
});

export const registerUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(255),
  password: z.string().min(8).max(128),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const verifyEmailSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
});

export const suspendTenantSchema = z.object({
  reason: z.string().optional(),
});

export const patchMeSchema = z.object({
  activeTenantId: z.string().uuid().nullable().optional(),
});

export * from "./commerce";
export * from "./storefront";
export * from "./admin";
export * from "./internal";
export * from "./marketing";
export * from "./guests";
export * from "./operations";

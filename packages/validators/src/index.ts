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

/** Self-serve customer organization (no platform role). */
export const createOrganizationSchema = z.object({
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
  /** Guest-facing website. Null clears. Validated again in domain. */
  websiteUrl: z.string().max(2048).nullable().optional(),
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
  /** Phase C1+ hotel metadata — optional; APIs wire in C2/C3. */
  roomTypeId: z.string().uuid().nullable().optional(),
  roomNumber: z.string().trim().min(1).max(64).nullable().optional(),
  floor: z.string().trim().min(1).max(32).nullable().optional(),
});

export const updateUnitSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  maxGuests: z.number().int().min(1).max(50).optional(),
  bedrooms: z.number().int().min(0).max(20).optional(),
  bathrooms: z.number().int().min(0).max(20).optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
  roomTypeId: z.string().uuid().nullable().optional(),
  roomNumber: z.string().trim().min(1).max(64).nullable().optional(),
  floor: z.string().trim().min(1).max(32).nullable().optional(),
});

/** Phase C3 — bulk physical room creation (max 200). */
export const bulkCreateUnitsNumberingSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("sequential"),
    prefix: z.string().trim().max(16).optional(),
    start: z.number().int().min(0).max(1_000_000),
    count: z.number().int().min(1).max(200),
    padWidth: z.number().int().min(1).max(16).optional(),
  }),
  z.object({
    mode: z.literal("explicit"),
    roomNumbers: z
      .array(z.string().trim().min(1).max(64))
      .min(1)
      .max(200),
  }),
]);

export const bulkCreateUnitsSchema = z.object({
  roomTypeId: z.string().uuid(),
  numbering: bulkCreateUnitsNumberingSchema,
  floor: z.string().trim().min(1).max(32).nullable().optional(),
  bedrooms: z.number().int().min(0).max(20).optional(),
  bathrooms: z.number().int().min(0).max(20).optional(),
  preview: z.boolean().optional(),
  clientRequestId: z.string().trim().min(1).max(128).nullable().optional(),
});

/** Phase C1 contracts — RoomType CRUD routes arrive in C2. */
export const roomTypeStatusSchema = z.enum(["active", "inactive"]);

export const roomTypeCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const createRoomTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    code: roomTypeCodeSchema.nullable().optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    maxGuests: z.number().int().min(1).max(100),
    maxAdults: z.number().int().min(0).max(100).nullable().optional(),
    maxChildren: z.number().int().min(0).max(100).nullable().optional(),
    status: roomTypeStatusSchema.optional(),
    sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  })
  .superRefine((value, ctx) => {
    const adults = value.maxAdults ?? null;
    const children = value.maxChildren ?? null;
    if (adults !== null && children !== null && adults + children > value.maxGuests) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "maxAdults + maxChildren cannot exceed maxGuests",
        path: ["maxGuests"],
      });
    }
  });

export const updateRoomTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    code: roomTypeCodeSchema.nullable().optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    maxGuests: z.number().int().min(1).max(100).optional(),
    maxAdults: z.number().int().min(0).max(100).nullable().optional(),
    maxChildren: z.number().int().min(0).max(100).nullable().optional(),
    status: roomTypeStatusSchema.optional(),
    sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.maxGuests !== undefined &&
      value.maxAdults != null &&
      value.maxChildren != null &&
      value.maxAdults + value.maxChildren > value.maxGuests
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "maxAdults + maxChildren cannot exceed maxGuests",
        path: ["maxGuests"],
      });
    }
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
export * from "./direct-booking";
export * from "./admin";
export * from "./internal";
export * from "./marketing";
export * from "./guests";
export * from "./operations";
export * from "./cleaning";
export * from "./messaging";
export * from "./reservation-import";
export * from "./website";
export * from "./websiteThemes";

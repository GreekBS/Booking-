import { z } from "zod";
import { paginationSchema } from "./pagination";

/** 32 random bytes rendered as hex — see `generateOpaqueToken`. */
export const qrTokenSchema = z.string().trim().regex(/^[0-9a-f]{64}$/i, {
  message: "Invalid QR token",
});

export const resolveQrBodySchema = z.object({
  token: qrTokenSchema,
});

export const cleaningTemplateQuerySchema = z.object({
  propertyId: z.string().uuid(),
});

export const cleaningChecklistItemSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  label: z.string().trim().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  required: z.boolean().optional(),
  photoRequired: z.boolean().optional(),
});

export const upsertCleaningTemplateBodySchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  minimumCompletionPhotos: z.number().int().min(0).max(50),
  items: z.array(cleaningChecklistItemSchema).min(1).max(60),
});

/** Exactly one of locationId or unitId (legacy). */
function exactlyOneLocationOrUnit<
  T extends { locationId?: string; unitId?: string },
>(schema: z.ZodType<T>) {
  return schema.refine(
    (value) =>
      Number(value.locationId != null) + Number(value.unitId != null) === 1,
    { message: "Provide either locationId or unitId" },
  );
}

export const cleaningContextQuerySchema = exactlyOneLocationOrUnit(
  z.object({
    locationId: z.string().uuid().optional(),
    unitId: z.string().uuid().optional(),
  }),
);

export const startCleaningBodySchema = exactlyOneLocationOrUnit(
  z.object({
    locationId: z.string().uuid().optional(),
    unitId: z.string().uuid().optional(),
  }),
);

export const updateCleaningItemBodySchema = z.object({
  checked: z.boolean(),
});

export const completeCleaningBodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  completionNote: z.string().max(2000).nullable().optional(),
});

export const cleaningPhotoUploadMetaSchema = z.object({
  executionItemId: z.string().uuid().nullable().optional(),
});

export const listCleaningHistoryQuerySchema = paginationSchema.extend({
  propertyId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  cleaningLocationId: z.string().uuid().optional(),
  entireTenant: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const bulkInitializeCleaningLocationsBodySchema = z.object({
  propertyId: z.string().uuid(),
  count: z.number().int().min(1).max(300),
});

export const addCleaningLocationBodySchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
});

export const renameCleaningLocationBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
});

export const cleaningLocationsBoardQuerySchema = z.object({
  propertyId: z.string().uuid(),
});

/** 4–8 digit property staff PIN (never logged / never returned). */
export const staffPinSchema = z
  .string()
  .regex(/^\d{4,8}$/, { message: "Staff PIN must be 4–8 digits" });

export const setStaffPinBodySchema = z.object({
  pin: staffPinSchema,
});

export const unlockStaffPinBodySchema = z.object({
  token: qrTokenSchema,
  pin: staffPinSchema,
});

export const markStaffHousekeepingBodySchema = z.object({
  target: z.enum(["CLEAN", "DIRTY"]),
  expectedVersion: z.number().int().positive(),
});

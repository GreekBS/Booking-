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

export const cleaningContextQuerySchema = z.object({
  unitId: z.string().uuid(),
});

export const startCleaningBodySchema = z.object({
  unitId: z.string().uuid(),
});

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
  entireTenant: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

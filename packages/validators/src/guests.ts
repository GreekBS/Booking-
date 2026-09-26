import { z } from "zod";
import { paginationSchema } from "./pagination";

export const listGuestsQuerySchema = paginationSchema.extend({
  propertyId: z.string().uuid().optional(),
  entireTenant: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  search: z.string().max(255).optional(),
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const createGuestBodySchema = z.object({
  displayName: z.string().min(1).max(255),
  firstName: z.string().max(128).nullable().optional(),
  lastName: z.string().max(128).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  country: z.string().length(2).nullable().optional(),
  preferredLanguage: z.string().max(16).nullable().optional(),
});

export const updateGuestBodySchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  firstName: z.string().max(128).nullable().optional(),
  lastName: z.string().max(128).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  country: z.string().length(2).nullable().optional(),
  preferredLanguage: z.string().max(16).nullable().optional(),
});

export const addGuestNoteBodySchema = z.object({
  body: z.string().min(1).max(4000),
  propertyId: z.string().uuid().nullable().optional(),
});

export const createGuestTagBodySchema = z.object({
  name: z.string().min(1).max(64),
});

export const searchGuestsForBookingQuerySchema = z.object({
  propertyId: z.string().uuid(),
  search: z.string().min(2).max(255),
  limit: z.coerce.number().int().min(1).max(25).optional(),
});

export const getGuestForBookingSelectionQuerySchema = z.object({
  propertyId: z.string().uuid(),
  guestId: z.string().uuid(),
});

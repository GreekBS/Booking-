import { z } from "zod";

export const updateTenantSettingsSchema = z.object({
  timezone: z.string().optional(),
  defaultLocale: z.string().optional(),
  defaultCurrency: z.string().length(3).optional(),
  dateFormat: z.enum(["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"]).optional(),
  timeFormat: z.enum(["24h", "12h"]).optional(),
});

export const updateCommerceSettingsSchema = z.object({
  defaultHoldTtlSeconds: z.number().int().min(60).max(86400).optional(),
  confirmationMode: z.enum(["manual", "payment_required"]).optional(),
  defaultCurrency: z.string().length(3).optional(),
});

export const allowedDomainsSchema = z
  .array(z.string().min(1).max(253))
  .max(50)
  .default([]);

export const createPublishableKeySchema = z.object({
  environment: z.enum(["test", "live"]),
  allowedDomains: allowedDomainsSchema.optional(),
});

export const updatePublishableKeyDomainsSchema = z.object({
  allowedDomains: allowedDomainsSchema,
});

export const listHoldsQuerySchema = z.object({
  unitId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
});

export const manualBookingWizardSchema = z.object({
  unitId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestCount: z.number().int().min(1).max(50),
  guest: z.object({
    name: z.string().min(1).max(255),
    email: z.string().email(),
    phone: z.string().max(50).nullable().optional(),
  }),
  confirm: z.boolean().optional(),
});

const feedSemanticModeSchema = z.enum([
  "mixed_or_unknown_feed",
  "availability_block_feed",
  "reservation_feed",
]);

/** CM-4b S3f — PUT semantic-mode body. Rejects unknown keys including tenantId. */
export const setChannelConnectionSemanticModeSchema = z
  .object({
    targetMode: feedSemanticModeSchema,
    expectedSemanticConfigVersion: z.number().int().positive(),
    commandId: z.string().trim().min(1).max(255),
    confirmation: z.object({
      confirmed: z.literal(true),
      acknowledgedFromMode: feedSemanticModeSchema,
      acknowledgedToMode: feedSemanticModeSchema,
    }),
    reason: z
      .string()
      .optional()
      .transform((value) => {
        if (value === undefined) {
          return undefined;
        }
        const trimmed = value.trim();
        return trimmed.length === 0 ? undefined : trimmed;
      })
      .refine((value) => value === undefined || value.length <= 500, {
        message: "reason must be at most 500 characters",
      }),
  })
  .strict();

const channelSourceSchema = z.enum([
  "direct",
  "manual",
  "booking_com",
  "airbnb",
  "vrbo",
  "expedia",
  "google_vacation_rentals",
  "ical",
]);

/** CM-4b S4a-1 — create connection body. */
export const createChannelConnectionSchema = z
  .object({
    provider: channelSourceSchema,
    displayName: z.string().trim().min(1).max(255),
    /** Active Property workspace affinity (AP 1.2). */
    workspacePropertyId: z.string().uuid(),
    connectionId: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

/** CM-4b S4a-1 — metadata patch. */
export const updateChannelConnectionMetadataSchema = z
  .object({
    displayName: z.string().trim().min(1).max(255),
  })
  .strict();

/** CM-4b S4a-1 — put credentials. */
export const putChannelConnectionCredentialsSchema = z
  .object({
    material: z.record(z.string().min(1).max(4096)).refine(
      (value) => Object.keys(value).length > 0 && Object.keys(value).length <= 32,
      { message: "material must have 1–32 non-empty keys" },
    ),
  })
  .strict();

const channelCredentialMaterialSchema = z
  .record(z.string().min(1).max(4096))
  .refine(
    (value) => Object.keys(value).length > 0 && Object.keys(value).length <= 32,
    { message: "material must have 1–32 non-empty keys" },
  );

/** P1-S6c — rotate iCal credentials. `material.feedUrl` is required server-side. */
export const rotateIcalConnectionCredentialsSchema = z
  .object({
    commandId: z.string().trim().min(1).max(255),
    material: channelCredentialMaterialSchema,
    expectedSemanticConfigVersion: z.number().int().positive().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

const channelSyncDirectionSchema = z.enum(["inbound", "outbound", "bidirectional"]);

/** P1-S6c — upsert a listing mapping for an iCal connection. */
export const upsertChannelListingMappingSchema = z
  .object({
    mappingId: z.string().trim().min(1).max(255).optional(),
    replaceMappingId: z.string().trim().min(1).max(255).optional(),
    externalListingId: z.string().trim().min(1).max(255),
    externalUnitId: z.string().trim().min(1).max(255).nullable().optional(),
    propertyId: z.string().trim().min(1).max(255),
    unitId: z.string().trim().min(1).max(255),
    syncDirection: channelSyncDirectionSchema.optional(),
    expectedSemanticConfigVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

/** P1-S6c — deactivate (pause) or archive a listing mapping. */
export const deactivateChannelListingMappingSchema = z
  .object({
    mode: z.enum(["paused", "archived"]).optional(),
    expectedSemanticConfigVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

/** CM-4b S4a-1 — put webhook verification secret. */
export const putChannelConnectionWebhookVerificationSchema = z
  .object({
    secret: z.string().min(1).max(4096),
  })
  .strict();

/** CM-4b S4a-1 — lifecycle commands. */
export const channelConnectionLifecycleCommandSchema = z
  .object({
    expectedSemanticConfigVersion: z.number().int().positive(),
    correlationId: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

/** CM-4b S4a-2b — public webhook route params. */
export const channelWebhookRouteParamsSchema = z
  .object({
    provider: channelSourceSchema,
    tenantId: z.string().uuid(),
    connectionId: z.string().trim().min(1).max(255),
  })
  .strict();

/** CM-4b S4a-2b — admin connection route param. */
export const channelConnectionIdParamSchema = z
  .object({
    connectionId: z.string().trim().min(1).max(255),
  })
  .strict();

/** CM-4b S4a-2b — admin inbox replay route params. */
export const channelInboxReplayRouteParamsSchema = z
  .object({
    connectionId: z.string().trim().min(1).max(255),
    inboxItemId: z.string().trim().min(1).max(255),
  })
  .strict();

/** CM-4b S4a-2b — empty body for poll/replay POSTs. */
export const emptyStrictBodySchema = z.object({}).strict();

import { z } from "zod";

const leadRelationship = z.enum([
  "owner",
  "property_manager",
  "hospitality_business",
  "other",
]);

const leadPortfolioSize = z.enum([
  "one",
  "two_to_five",
  "six_to_ten",
  "eleven_to_twenty_five",
  "twenty_six_to_fifty",
  "fifty_one_plus",
]);

const leadOperatingState = z.enum([
  "operating",
  "launching_soon",
  "planning",
]);

const leadRevenueRange = z.enum([
  "under_25k",
  "from_25k_to_75k",
  "from_75k_to_150k",
  "from_150k_to_300k",
  "from_300k_to_750k",
  "over_750k",
  "prefer_not_to_say",
]);

const leadInterest = z.enum(["run", "grow", "managed", "unsure"]);

const leadSource = z.enum([
  "homepage_nav",
  "homepage_hero",
  "homepage_final",
  "pms",
  "website_builder",
  "direct_bookings",
  "channel_manager",
  "vacation_rental_software",
  "property_management",
  "contact",
  "other",
]);

const leadAccommodationType = z.enum([
  "villa",
  "apartment",
  "vacation_rental",
  "hotel",
  "boutique_hotel",
  "guesthouse",
  "other",
]);

const leadChannel = z.enum([
  "booking_com",
  "airbnb",
  "expedia",
  "vrbo",
  "direct_bookings",
  "own_website",
  "other",
]);

const leadTool = z.enum([
  "pms",
  "channel_manager",
  "booking_engine",
  "website_platform",
  "none",
]);

const optionalTrimmed = (max: number) =>
  z
    .string()
    .max(max)
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

/**
 * Public lead creation payload.
 * `.strict()` rejects mass-assignment of status/notes/internal ids.
 */
export const createLeadSchema = z
  .object({
    /** Opaque UUID for this browser submission (retry idempotency). */
    submissionId: z.string().uuid(),
    fullName: z.string().trim().min(2).max(120),
    email: z
      .string()
      .trim()
      .email()
      .max(255)
      .transform((v) => v.toLowerCase()),
    phone: optionalTrimmed(40),
    country: z.string().trim().min(2).max(100),
    relationship: leadRelationship,
    portfolioSize: leadPortfolioSize,
    accommodationTypes: z
      .array(leadAccommodationType)
      .min(1)
      .max(10),
    propertyCountry: z.string().trim().min(2).max(100),
    propertyCity: optionalTrimmed(120),
    operatingState: leadOperatingState,
    channels: z.array(leadChannel).max(12).optional().default([]),
    tools: z.array(leadTool).max(8).optional().default([]),
    softwareName: optionalTrimmed(120),
    hasWebsite: z.boolean().optional().nullable(),
    acceptsDirectBookings: z.boolean().optional().nullable(),
    revenueRange: leadRevenueRange.optional().nullable(),
    interests: z.array(leadInterest).min(1).max(4),
    message: optionalTrimmed(1000),
    source: leadSource,
    utmSource: optionalTrimmed(200),
    utmMedium: optionalTrimmed(200),
    utmCampaign: optionalTrimmed(200),
  })
  .strict();

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

const leadStatus = z.enum([
  "new",
  "contacted",
  "qualified",
  "demo",
  "won",
  "lost",
]);

/** Platform Admin — change internal workflow status only. */
export const updateLeadStatusSchema = z
  .object({
    status: leadStatus,
  })
  .strict();

export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;

/**
 * Marketing lead controlled values.
 * Persist as Prisma enums (snake_case) — not User/Tenant roles.
 */

export const LEAD_RELATIONSHIPS = [
  "owner",
  "property_manager",
  "hospitality_business",
  "other",
] as const;

export const LEAD_PORTFOLIO_SIZES = [
  "one",
  "two_to_five",
  "six_to_ten",
  "eleven_to_twenty_five",
  "twenty_six_to_fifty",
  "fifty_one_plus",
] as const;

export const LEAD_OPERATING_STATES = [
  "operating",
  "launching_soon",
  "planning",
] as const;

export const LEAD_REVENUE_RANGES = [
  "under_25k",
  "from_25k_to_75k",
  "from_75k_to_150k",
  "from_150k_to_300k",
  "from_300k_to_750k",
  "over_750k",
  "prefer_not_to_say",
] as const;

export const LEAD_INTERESTS = ["run", "grow", "managed", "unsure"] as const;

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "demo",
  "won",
  "lost",
] as const;

export const LEAD_SOURCES = [
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
] as const;

export const LEAD_ACCOMMODATION_TYPES = [
  "villa",
  "apartment",
  "vacation_rental",
  "hotel",
  "boutique_hotel",
  "guesthouse",
  "other",
] as const;

export const LEAD_CHANNELS = [
  "booking_com",
  "airbnb",
  "expedia",
  "vrbo",
  "direct_bookings",
  "own_website",
  "other",
] as const;

export const LEAD_TOOLS = [
  "pms",
  "channel_manager",
  "booking_engine",
  "website_platform",
  "none",
] as const;

export type LeadRelationship = (typeof LEAD_RELATIONSHIPS)[number];
export type LeadPortfolioSize = (typeof LEAD_PORTFOLIO_SIZES)[number];
export type LeadOperatingState = (typeof LEAD_OPERATING_STATES)[number];
export type LeadRevenueRange = (typeof LEAD_REVENUE_RANGES)[number];
export type LeadInterest = (typeof LEAD_INTERESTS)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadAccommodationType = (typeof LEAD_ACCOMMODATION_TYPES)[number];
export type LeadChannel = (typeof LEAD_CHANNELS)[number];
export type LeadTool = (typeof LEAD_TOOLS)[number];

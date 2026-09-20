import type {
  LeadAccommodationType,
  LeadChannel,
  LeadInterest,
  LeadOperatingState,
  LeadPortfolioSize,
  LeadRelationship,
  LeadRevenueRange,
  LeadSource,
  LeadStatus,
  LeadTool,
} from "@hcp/domain";

const RELATIONSHIP: Record<LeadRelationship, string> = {
  owner: "Owner",
  property_manager: "Property manager",
  hospitality_business: "Hospitality business",
  other: "Other",
};

const PORTFOLIO: Record<LeadPortfolioSize, string> = {
  one: "1",
  two_to_five: "2–5",
  six_to_ten: "6–10",
  eleven_to_twenty_five: "11–25",
  twenty_six_to_fifty: "26–50",
  fifty_one_plus: "51+",
};

const OPERATING: Record<LeadOperatingState, string> = {
  operating: "Already operating",
  launching_soon: "Launching soon",
  planning: "Planning",
};

const REVENUE: Record<LeadRevenueRange, string> = {
  under_25k: "Under €25k",
  from_25k_to_75k: "€25k–€75k",
  from_75k_to_150k: "€75k–€150k",
  from_150k_to_300k: "€150k–€300k",
  from_300k_to_750k: "€300k–€750k",
  over_750k: "Over €750k",
  prefer_not_to_say: "Prefer not to say",
};

const INTEREST: Record<LeadInterest, string> = {
  run: "Run",
  grow: "Grow",
  managed: "Managed",
  unsure: "Unsure",
};

const STATUS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  demo: "Demo",
  won: "Won",
  lost: "Lost",
};

const SOURCE: Record<LeadSource, string> = {
  homepage_nav: "Homepage nav",
  homepage_hero: "Homepage hero",
  homepage_final: "Homepage final CTA",
  pms: "PMS",
  website_builder: "Website builder",
  direct_bookings: "Direct bookings",
  channel_manager: "Channel manager",
  vacation_rental_software: "Vacation rental software",
  property_management: "Property management",
  contact: "Contact",
  other: "Other",
};

const ACCOMMODATION: Record<LeadAccommodationType, string> = {
  villa: "Villa",
  apartment: "Apartment",
  vacation_rental: "Vacation rental",
  hotel: "Hotel",
  boutique_hotel: "Boutique hotel",
  guesthouse: "Guesthouse",
  other: "Other",
};

const CHANNEL: Record<LeadChannel, string> = {
  booking_com: "Booking.com",
  airbnb: "Airbnb",
  expedia: "Expedia",
  vrbo: "Vrbo",
  direct_bookings: "Direct bookings",
  own_website: "Own website",
  other: "Other",
};

const TOOL: Record<LeadTool, string> = {
  pms: "PMS",
  channel_manager: "Channel manager",
  booking_engine: "Booking engine",
  website_platform: "Website platform",
  none: "None",
};

function labelOf<T extends string>(map: Record<T, string>, value: T): string {
  return map[value] ?? value;
}

export const leadLabels = {
  relationship: (v: LeadRelationship) => labelOf(RELATIONSHIP, v),
  portfolioSize: (v: LeadPortfolioSize) => labelOf(PORTFOLIO, v),
  operatingState: (v: LeadOperatingState) => labelOf(OPERATING, v),
  revenueRange: (v: LeadRevenueRange) => labelOf(REVENUE, v),
  interest: (v: LeadInterest) => labelOf(INTEREST, v),
  status: (v: LeadStatus) => labelOf(STATUS, v),
  source: (v: LeadSource) => labelOf(SOURCE, v),
  accommodation: (v: LeadAccommodationType) => labelOf(ACCOMMODATION, v),
  channel: (v: LeadChannel) => labelOf(CHANNEL, v),
  tool: (v: LeadTool) => labelOf(TOOL, v),
  interestsSummary: (values: LeadInterest[]) =>
    values.map((v) => INTEREST[v] ?? v).join(", ") || "—",
};

export const LEAD_STATUS_OPTIONS = Object.entries(STATUS).map(([value, label]) => ({
  value: value as LeadStatus,
  label,
}));

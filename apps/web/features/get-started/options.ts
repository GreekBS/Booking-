import type {
  LeadAccommodationType,
  LeadChannel,
  LeadInterest,
  LeadOperatingState,
  LeadPortfolioSize,
  LeadRelationship,
  LeadRevenueRange,
  LeadTool,
} from "@hcp/domain";

export const RELATIONSHIP_OPTIONS: Array<{
  value: LeadRelationship;
  label: string;
}> = [
  { value: "owner", label: "Owner" },
  { value: "property_manager", label: "Property manager" },
  { value: "hospitality_business", label: "Hospitality business" },
  { value: "other", label: "Other" },
];

export const PORTFOLIO_OPTIONS: Array<{
  value: LeadPortfolioSize;
  label: string;
}> = [
  { value: "one", label: "1" },
  { value: "two_to_five", label: "2–5" },
  { value: "six_to_ten", label: "6–10" },
  { value: "eleven_to_twenty_five", label: "11–25" },
  { value: "twenty_six_to_fifty", label: "26–50" },
  { value: "fifty_one_plus", label: "51+" },
];

export const OPERATING_STATE_OPTIONS: Array<{
  value: LeadOperatingState;
  label: string;
}> = [
  { value: "operating", label: "Already operating" },
  { value: "launching_soon", label: "Launching soon" },
  { value: "planning", label: "Still planning" },
];

export const ACCOMMODATION_OPTIONS: Array<{
  value: LeadAccommodationType;
  label: string;
}> = [
  { value: "villa", label: "Villa" },
  { value: "apartment", label: "Apartment" },
  { value: "vacation_rental", label: "Vacation rental" },
  { value: "hotel", label: "Hotel" },
  { value: "boutique_hotel", label: "Boutique hotel" },
  { value: "guesthouse", label: "Guesthouse" },
  { value: "other", label: "Other" },
];

export const CHANNEL_OPTIONS: Array<{ value: LeadChannel; label: string }> = [
  { value: "booking_com", label: "Booking.com" },
  { value: "airbnb", label: "Airbnb" },
  { value: "expedia", label: "Expedia" },
  { value: "vrbo", label: "Vrbo" },
  { value: "direct_bookings", label: "Direct bookings" },
  { value: "own_website", label: "Own website" },
  { value: "other", label: "Other" },
];

export const TOOL_OPTIONS: Array<{ value: LeadTool; label: string }> = [
  { value: "pms", label: "PMS" },
  { value: "channel_manager", label: "Channel manager" },
  { value: "booking_engine", label: "Booking engine" },
  { value: "website_platform", label: "Website platform" },
  { value: "none", label: "None yet" },
];

export const REVENUE_OPTIONS: Array<{
  value: LeadRevenueRange;
  label: string;
}> = [
  { value: "under_25k", label: "Under €25k" },
  { value: "from_25k_to_75k", label: "€25k–€75k" },
  { value: "from_75k_to_150k", label: "€75k–€150k" },
  { value: "from_150k_to_300k", label: "€150k–€300k" },
  { value: "from_300k_to_750k", label: "€300k–€750k" },
  { value: "over_750k", label: "€750k+" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const INTEREST_OPTIONS: Array<{
  value: LeadInterest;
  label: string;
  description: string;
}> = [
  {
    value: "run",
    label: "Run",
    description: "Property operations and PMS.",
  },
  {
    value: "grow",
    label: "Grow",
    description: "Direct presence, direct bookings, distribution, and brand growth.",
  },
  {
    value: "managed",
    label: "Let Talos manage it",
    description: "Full-service property management.",
  },
  {
    value: "unsure",
    label: "Not sure yet",
    description: "Help me understand the right setup.",
  },
];

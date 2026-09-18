import type {
  LeadAccommodationType,
  LeadChannel,
  LeadInterest,
  LeadOperatingState,
  LeadPortfolioSize,
  LeadRelationship,
  LeadRevenueRange,
  LeadSource,
  LeadTool,
} from "@hcp/domain";

export type GetStartedFormState = {
  submissionId: string;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  relationship: LeadRelationship | "";
  portfolioSize: LeadPortfolioSize | "";
  accommodationTypes: LeadAccommodationType[];
  propertyCountry: string;
  propertyCity: string;
  operatingState: LeadOperatingState | "";
  channels: LeadChannel[];
  tools: LeadTool[];
  softwareName: string;
  hasWebsite: boolean | null;
  acceptsDirectBookings: boolean | null;
  revenueRange: LeadRevenueRange | "";
  interests: LeadInterest[];
  message: string;
  source: LeadSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

export type GetStartedStep = 1 | 2 | 3 | 4 | 5;

export const STEP_META: Record<
  GetStartedStep,
  { title: string; lede: string }
> = {
  1: {
    title: "About you",
    lede: "Tell us who we are speaking with — so we can understand your role in the business.",
  },
  2: {
    title: "Your properties",
    lede: "A clear picture of what you operate helps us recommend the right Talos path.",
  },
  3: {
    title: "How you operate today",
    lede: "Optional context on channels and tools. No credentials or API keys — ever.",
  },
  4: {
    title: "Business size",
    lede: "Optional. Approximate annual revenue only — never an exact figure.",
  },
  5: {
    title: "How can Talos help?",
    lede: "Choose the path that fits. You can select more than one.",
  },
};

export function createEmptyFormState(input: {
  source: LeadSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  preselectManaged?: boolean;
  submissionId?: string;
}): GetStartedFormState {
  return {
    submissionId: input.submissionId ?? crypto.randomUUID(),
    fullName: "",
    email: "",
    phone: "",
    country: "",
    relationship: "",
    portfolioSize: "",
    accommodationTypes: [],
    propertyCountry: "",
    propertyCity: "",
    operatingState: "",
    channels: [],
    tools: [],
    softwareName: "",
    hasWebsite: null,
    acceptsDirectBookings: null,
    revenueRange: "",
    interests: input.preselectManaged ? ["managed"] : [],
    message: "",
    source: input.source,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
  };
}

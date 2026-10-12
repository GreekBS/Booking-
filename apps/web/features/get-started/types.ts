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
    title: "Σχετικά με εσάς",
    lede: "Πείτε μας με ποιον μιλάμε — ώστε να κατανοήσουμε τον ρόλο σας στην επιχείρηση.",
  },
  2: {
    title: "Τα καταλύματά σας",
    lede: "Μια σαφής εικόνα του τι διαχειρίζεστε μας βοηθά να προτείνουμε τη σωστή διαδρομή Talos.",
  },
  3: {
    title: "Πώς λειτουργείτε σήμερα",
    lede: "Προαιρετικό πλαίσιο για κανάλια και εργαλεία. Χωρίς διαπιστευτήρια ή κλειδιά API — ποτέ.",
  },
  4: {
    title: "Μέγεθος επιχείρησης",
    lede: "Προαιρετικό. Μόνο ενδεικτικά ετήσια έσοδα — ποτέ ακριβές αριθμός.",
  },
  5: {
    title: "Πώς μπορεί να βοηθήσει το Talos;",
    lede: "Επιλέξτε τη διαδρομή που σας ταιριάζει. Μπορείτε να επιλέξετε περισσότερες από μία.",
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

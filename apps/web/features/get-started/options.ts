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
  { value: "owner", label: "Ιδιοκτήτης" },
  { value: "property_manager", label: "Διαχειριστής καταλυμάτων" },
  { value: "hospitality_business", label: "Επιχείρηση φιλοξενίας" },
  { value: "other", label: "Άλλο" },
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
  { value: "operating", label: "Ήδη σε λειτουργία" },
  { value: "launching_soon", label: "Έναρξη σύντομα" },
  { value: "planning", label: "Ακόμα στον σχεδιασμό" },
];

export const ACCOMMODATION_OPTIONS: Array<{
  value: LeadAccommodationType;
  label: string;
}> = [
  { value: "villa", label: "Βίλα" },
  { value: "apartment", label: "Διαμέρισμα" },
  { value: "vacation_rental", label: "Βραχυχρόνια μίσθωση" },
  { value: "hotel", label: "Ξενοδοχείο" },
  { value: "boutique_hotel", label: "Boutique ξενοδοχείο" },
  { value: "guesthouse", label: "Ξενώνας" },
  { value: "other", label: "Άλλο" },
];

export const CHANNEL_OPTIONS: Array<{ value: LeadChannel; label: string }> = [
  { value: "booking_com", label: "Booking.com" },
  { value: "airbnb", label: "Airbnb" },
  { value: "expedia", label: "Expedia" },
  { value: "vrbo", label: "Vrbo" },
  { value: "direct_bookings", label: "Απευθείας κρατήσεις" },
  { value: "own_website", label: "Ιδιόκτητος ιστότοπος" },
  { value: "other", label: "Άλλο" },
];

export const TOOL_OPTIONS: Array<{ value: LeadTool; label: string }> = [
  { value: "pms", label: "PMS" },
  { value: "channel_manager", label: "Διαχείριση καναλιών (Channel Manager)" },
  { value: "booking_engine", label: "Μηχανή κρατήσεων" },
  { value: "website_platform", label: "Πλατφόρμα ιστοτόπου" },
  { value: "none", label: "Κανένα ακόμα" },
];

export const REVENUE_OPTIONS: Array<{
  value: LeadRevenueRange;
  label: string;
}> = [
  { value: "under_25k", label: "Κάτω από €25k" },
  { value: "from_25k_to_75k", label: "€25k–€75k" },
  { value: "from_75k_to_150k", label: "€75k–€150k" },
  { value: "from_150k_to_300k", label: "€150k–€300k" },
  { value: "from_300k_to_750k", label: "€300k–€750k" },
  { value: "over_750k", label: "€750k+" },
  { value: "prefer_not_to_say", label: "Προτιμώ να μην απαντήσω" },
];

export const INTEREST_OPTIONS: Array<{
  value: LeadInterest;
  label: string;
  description: string;
}> = [
  {
    value: "run",
    label: "Λειτουργία",
    description: "Λειτουργίες καταλύματος και PMS.",
  },
  {
    value: "grow",
    label: "Ανάπτυξη",
    description:
      "Απευθείας παρουσία, απευθείας κρατήσεις, διανομή και ανάπτυξη επωνυμίας.",
  },
  {
    value: "managed",
    label: "Αφήστε το Talos να το διαχειριστεί",
    description: "Πλήρης διαχείριση καταλυμάτων.",
  },
  {
    value: "unsure",
    label: "Δεν είμαι ακόμα σίγουρος/η",
    description: "Βοηθήστε με να καταλάβω τη σωστή ρύθμιση.",
  },
];

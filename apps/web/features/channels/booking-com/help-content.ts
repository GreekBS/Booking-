/**
 * Booking.com Help Center content + screenshot manifest (CM-4c-5).
 * Screenshot slots BOOKING-HELP-01..14 — placeholders until Extranet access.
 */

export interface ChannelHelpScreenshotSlot {
  id: string;
  provider: "booking_com";
  stepOrder: number;
  caption: string;
  altText: string;
  annotation?: string;
  /** null until a real asset is available — never fabricate Booking.com UI. */
  imageSrc: string | null;
}

export const BOOKING_COM_SCREENSHOT_MANIFEST: readonly ChannelHelpScreenshotSlot[] = [
  {
    id: "BOOKING-HELP-01",
    provider: "booking_com",
    stepOrder: 1,
    caption: "Booking.com Extranet — Account overview",
    altText: "Placeholder for Booking.com Extranet account overview screenshot",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-02",
    provider: "booking_com",
    stepOrder: 2,
    caption: "Channel Manager menu in Booking.com Extranet",
    altText: "Placeholder for Channel Manager navigation screenshot",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-03",
    provider: "booking_com",
    stepOrder: 3,
    caption: "Request Talos as channel manager",
    altText: "Placeholder for requesting Talos connection screenshot",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-04",
    provider: "booking_com",
    stepOrder: 4,
    caption: "Select Reservations connection type",
    altText: "Placeholder for Reservations connection type screenshot",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-05",
    provider: "booking_com",
    stepOrder: 5,
    caption: "Select Rates & Availability connection type",
    altText: "Placeholder for Rates and Availability connection type screenshot",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-06",
    provider: "booking_com",
    stepOrder: 6,
    caption: "Talos — match Booking.com property",
    altText: "Placeholder for Talos property matching screen",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-07",
    provider: "booking_com",
    stepOrder: 7,
    caption: "Talos — room mapping",
    altText: "Placeholder for Talos room mapping screen",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-08",
    provider: "booking_com",
    stepOrder: 8,
    caption: "Talos — rate plan mapping",
    altText: "Placeholder for Talos rate mapping screen",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-09",
    provider: "booking_com",
    stepOrder: 9,
    caption: "Talos — mapping validation results",
    altText: "Placeholder for Talos validation results screen",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-10",
    provider: "booking_com",
    stepOrder: 10,
    caption: "Talos — initial synchronization preview",
    altText: "Placeholder for initial sync preview screen",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-11",
    provider: "booking_com",
    stepOrder: 11,
    caption: "Talos — confirm synchronization",
    altText: "Placeholder for sync confirmation screen",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-12",
    provider: "booking_com",
    stepOrder: 12,
    caption: "Talos — connection health dashboard",
    altText: "Placeholder for Booking.com health dashboard",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-13",
    provider: "booking_com",
    stepOrder: 13,
    caption: "Talos — pause or disconnect",
    altText: "Placeholder for pause and disconnect controls",
    imageSrc: null,
  },
  {
    id: "BOOKING-HELP-14",
    provider: "booking_com",
    stepOrder: 14,
    caption: "Troubleshooting — needs attention state",
    altText: "Placeholder for degraded connection attention state",
    imageSrc: null,
  },
] as const;

export interface BookingComHelpSection {
  id: string;
  title: string;
  body: string[];
  screenshotIds?: string[];
}

export const BOOKING_COM_HELP_SECTIONS: readonly BookingComHelpSection[] = [
  {
    id: "what-it-does",
    title: "1. What the Booking.com integration does",
    body: [
      "Talos connects your property to Booking.com Connectivity so reservations flow into Talos, and availability, Standard rates, and restrictions sync from Talos to Booking.com.",
      "Talos does not import Booking.com prices into your Talos rate plans.",
    ],
  },
  {
    id: "before-you-start",
    title: "2. Before you start",
    body: [
      "You need an active Talos property with rooms (units) and Standard rate plans.",
      "You need Booking.com Extranet access for the hotel you want to connect.",
      "Live Booking.com partner activation may still be pending — Talos will show this clearly until access is ready.",
    ],
    screenshotIds: ["BOOKING-HELP-01"],
  },
  {
    id: "connect-in-booking",
    title: "3. Connect Talos in Booking.com",
    body: [
      "In Booking.com Extranet go to Account → Channel Manager.",
      "Request or select Talos and enable Reservations plus Rates & Availability.",
      "Until Talos is listed as a Booking.com Connectivity Partner for your account, live authorization cannot complete.",
    ],
    screenshotIds: [
      "BOOKING-HELP-02",
      "BOOKING-HELP-03",
      "BOOKING-HELP-04",
      "BOOKING-HELP-05",
    ],
  },
  {
    id: "match-property",
    title: "4. Match your property",
    body: [
      "Choose the Talos property and match it to the Booking.com hotel (hotel ID).",
      "One Booking.com hotel maps to one Talos channel connection in V1.",
    ],
    screenshotIds: ["BOOKING-HELP-06"],
  },
  {
    id: "map-rooms",
    title: "5. Map your rooms",
    body: [
      "Match each Talos room to exactly one Booking.com room type.",
      "Ambiguous or duplicate room mappings block activation.",
    ],
    screenshotIds: ["BOOKING-HELP-07"],
  },
  {
    id: "map-rates",
    title: "6. Map your rate plans",
    body: [
      "Map Talos rate plans to Booking.com rate plans and roomrates.",
      "V1 supports the Standard pricing model only.",
    ],
    screenshotIds: ["BOOKING-HELP-08"],
  },
  {
    id: "review-sync",
    title: "7. Review synchronization",
    body: [
      "Validate mappings, then review the initial sync preview.",
      "Talos becomes the source for availability, rates, and restrictions. Reservations continue to flow from Booking.com into Talos.",
    ],
    screenshotIds: ["BOOKING-HELP-09", "BOOKING-HELP-10"],
  },
  {
    id: "activate",
    title: "8. Activate the connection",
    body: [
      "Confirm the preview with the confirmation token. If anything changed, Talos asks you to generate a fresh preview.",
      "Activation is blocked until mappings and confirmed initial sync are ready.",
    ],
    screenshotIds: ["BOOKING-HELP-11"],
  },
  {
    id: "health",
    title: "9. Check connection health",
    body: [
      "After activation, the Booking.com dashboard shows reservation health, ARI push health, mappings, and issues needing attention.",
    ],
    screenshotIds: ["BOOKING-HELP-12"],
  },
  {
    id: "troubleshooting",
    title: "10. Troubleshooting",
    body: [
      "If a room is no longer mapped, fix the mapping before continuing sync.",
      "If availability sync fails, Talos retries automatically — check Issues for operator-friendly guidance.",
      "If Booking.com cannot be reached, wait and retry; no credentials are shown in the UI.",
    ],
    screenshotIds: ["BOOKING-HELP-14"],
  },
  {
    id: "pause-disconnect",
    title: "11. Pause / reconnect / disconnect",
    body: [
      "Pause stops outbound sync while keeping history.",
      "Disconnect ends the live link but does not delete booking history, reservation links, or audit evidence.",
    ],
    screenshotIds: ["BOOKING-HELP-13"],
  },
  {
    id: "faq",
    title: "12. FAQ",
    body: [
      "Does Talos overwrite Booking.com prices on first sync? Only after you review and confirm the preview.",
      "Can I map OBP/LOS pricing? Not in V1 — Standard only.",
      "Will Airbnb or Expedia appear here? Provider cards may list them as coming later; backends are not implemented yet.",
    ],
  },
] as const;

import {
  parseWebsiteDraftContent,
  type WebsiteDraftContent,
} from "@hcp/validators";

/** Distinct asset ids from Luxury Villa sample — mapped to boutique-hotel SVGs. */
export const BOUTIQUE_HOTEL_ASSET_IDS = {
  hero: "c2000000-0000-4000-8000-000000000001",
  gallery1: "c2000000-0000-4000-8000-000000000002",
  gallery2: "c2000000-0000-4000-8000-000000000003",
  gallery3: "c2000000-0000-4000-8000-000000000004",
  gallery4: "c2000000-0000-4000-8000-000000000005",
  split: "c2000000-0000-4000-8000-000000000006",
} as const;

export const BOUTIQUE_HOTEL_DISPLAY_NAME = "Maison Clarisse";

/**
 * Fictional boutique hotel sample — Zod v1 only, no real PMS/customer data.
 */
export function buildBoutiqueHotelSampleContent(): WebsiteDraftContent {
  return parseWebsiteDraftContent({
    contentSchemaVersion: 1 as const,
    locale: "en",
    themeId: "boutique_hotel",
    seo: {
      metaTitle: "Maison Clarisse · Boutique hotel",
      metaDescription:
        "A fictional boutique hotel sample for Talos Website Builder previews.",
    },
    sections: [
      {
        id: "d2000000-0000-4000-8000-000000000101",
        type: "hero" as const,
        sortOrder: 0,
        visible: true,
        headline: "Twenty-two rooms. One quiet address.",
        subheadline:
          "A fictional townhouse hotel where polished stone meets soft linen — designed for travelers who prefer proportion over spectacle.",
        backgroundAssetId: BOUTIQUE_HOTEL_ASSET_IDS.hero,
        ctaLabel: "Reserve a room",
        ctaUrl: "/book",
      },
      {
        id: "d2000000-0000-4000-8000-000000000102",
        type: "richtext" as const,
        sortOrder: 1,
        visible: true,
        body: "<p><strong>Maison Clarisse</strong> is a fictional boutique hotel created for design previews. The lobby holds a single long table, brass lamps, and a courtyard of citrus trees.</p><p>Guests arrive to quiet floors, linen robes, and a dining room that serves breakfast until late morning.</p>",
      },
      {
        id: "d2000000-0000-4000-8000-000000000103",
        type: "split" as const,
        sortOrder: 2,
        visible: true,
        assetId: BOUTIQUE_HOTEL_ASSET_IDS.split,
        headline: "Architecture with a soft voice",
        body: "Corridors are narrow on purpose. Light falls in bands across limestone. Every landing offers a chair and a view into the courtyard.",
        imagePosition: "right" as const,
      },
      {
        id: "d2000000-0000-4000-8000-000000000104",
        type: "highlights" as const,
        sortOrder: 3,
        visible: true,
        items: [
          {
            title: "Courtyard suite",
            text: "King bed, writing desk, and shutters that open to orange trees.",
          },
          {
            title: "Gallery room",
            text: "High ceilings, twin windows to the street, and a soaking tub.",
          },
          {
            title: "Attic chamber",
            text: "Sloped beams, reading nook, and a quiet city overlook.",
          },
        ],
      },
      {
        id: "d2000000-0000-4000-8000-000000000105",
        type: "gallery" as const,
        sortOrder: 4,
        visible: true,
        assetIds: [
          BOUTIQUE_HOTEL_ASSET_IDS.gallery1,
          BOUTIQUE_HOTEL_ASSET_IDS.gallery2,
          BOUTIQUE_HOTEL_ASSET_IDS.gallery3,
          BOUTIQUE_HOTEL_ASSET_IDS.gallery4,
        ],
        layout: "carousel" as const,
      },
      {
        id: "d2000000-0000-4000-8000-000000000106",
        type: "amenities" as const,
        sortOrder: 5,
        visible: true,
        displayMode: "custom" as const,
        customItems: [
          { label: "Courtyard breakfast" },
          { label: "In-room dining" },
          { label: "Concierge desk" },
          { label: "Library lounge" },
          { label: "Bicycle hire" },
          { label: "Late checkout by request" },
        ],
      },
      {
        id: "d2000000-0000-4000-8000-000000000107",
        type: "location" as const,
        sortOrder: 6,
        visible: true,
        showMap: true,
        directionsText:
          "Demo district — a quiet fictional street between the market square and the river promenade. Galleries and cafés within a short walk.",
      },
      {
        id: "d2000000-0000-4000-8000-000000000108",
        type: "highlights" as const,
        sortOrder: 7,
        visible: true,
        settings: { purpose: "nearby" },
        items: [
          {
            title: "River promenade",
            text: "Evening walks under plane trees — five minutes on foot.",
          },
          {
            title: "Market square",
            text: "Morning coffee and seasonal produce stalls.",
          },
          {
            title: "Independent cinema",
            text: "A restored foyer two streets away.",
          },
        ],
      },
      {
        id: "d2000000-0000-4000-8000-000000000109",
        type: "faq" as const,
        sortOrder: 8,
        visible: true,
        items: [
          {
            question: "Is Maison Clarisse a real hotel?",
            answer:
              "No. This is fictional sample content for Talos Website Builder theme previews.",
          },
          {
            question: "Do rooms include breakfast?",
            answer:
              "In this demo narrative, courtyard breakfast is included with every stay.",
          },
          {
            question: "How do guests reserve?",
            answer:
              "Use the booking call-to-action in the preview. Live booking connects later via Talos.",
          },
        ],
      },
      {
        id: "d2000000-0000-4000-8000-000000000110",
        type: "cta" as const,
        sortOrder: 9,
        visible: true,
        headline: "Request your dates at Maison Clarisse",
        buttonLabel: "Reserve a room",
        buttonUrl: "/book",
      },
    ],
  });
}

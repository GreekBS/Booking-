import {
  parseWebsiteDraftContent,
  type WebsiteDraftContent,
} from "@hcp/validators";

/** Distinct asset ids — mapped to apartments-studios demo SVGs. */
export const APARTMENTS_STUDIOS_ASSET_IDS = {
  hero: "e3000000-0000-4000-8000-000000000001",
  gallery1: "e3000000-0000-4000-8000-000000000002",
  gallery2: "e3000000-0000-4000-8000-000000000003",
  gallery3: "e3000000-0000-4000-8000-000000000004",
  gallery4: "e3000000-0000-4000-8000-000000000005",
  split: "e3000000-0000-4000-8000-000000000006",
} as const;

export const APARTMENTS_STUDIOS_DISPLAY_NAME = "Nereida Apartments";

/**
 * Fictional apartments & studios sample — Zod v1 only, no real PMS data.
 */
export function buildApartmentsStudiosSampleContent(): WebsiteDraftContent {
  return parseWebsiteDraftContent({
    contentSchemaVersion: 1 as const,
    locale: "en",
    themeId: "apartments_studios",
    seo: {
      metaTitle: "Nereida Apartments · Studios by the water",
      metaDescription:
        "A fictional apartments & studios sample for Talos Website Builder previews.",
    },
    sections: [
      {
        id: "f3000000-0000-4000-8000-000000000101",
        type: "hero" as const,
        sortOrder: 0,
        visible: true,
        headline: "Bright studios for easy Mediterranean stays",
        subheadline:
          "A fictional coastal apartment complex with self-catering studios, shared terraces, and a short walk to the water.",
        backgroundAssetId: APARTMENTS_STUDIOS_ASSET_IDS.hero,
        ctaLabel: "Check availability",
        ctaUrl: "/book",
      },
      {
        id: "f3000000-0000-4000-8000-000000000102",
        type: "richtext" as const,
        sortOrder: 1,
        visible: true,
        body: "<p><strong>Nereida Apartments</strong> is a fictional collection of studios and one-bedroom apartments created for design previews. White walls, soft blue shutters, and practical kitchens make everyday stays simple.</p><p>Guests share a sunny terrace and a small pool — mornings start with coffee on the balcony.</p>",
      },
      {
        id: "f3000000-0000-4000-8000-000000000103",
        type: "split" as const,
        sortOrder: 2,
        visible: true,
        assetId: APARTMENTS_STUDIOS_ASSET_IDS.split,
        headline: "Designed for longer, easier stays",
        body: "Each unit includes a kitchenette, dining nook, and laundry access. Ideal for couples, small families, and travelers who prefer apartment comfort over hotel formality.",
        imagePosition: "left" as const,
      },
      {
        id: "f3000000-0000-4000-8000-000000000104",
        type: "highlights" as const,
        sortOrder: 3,
        visible: true,
        items: [
          {
            title: "Studio Azure",
            text: "Open-plan studio for two — balcony, kitchenette, and sea-facing shutters.",
          },
          {
            title: "Apartment Coral",
            text: "One bedroom, separate living area, and a private outdoor table.",
          },
          {
            title: "Family Suite Lime",
            text: "Two sleeping areas, sofa bed, and extra storage for longer stays.",
          },
        ],
      },
      {
        id: "f3000000-0000-4000-8000-000000000105",
        type: "gallery" as const,
        sortOrder: 4,
        visible: true,
        assetIds: [
          APARTMENTS_STUDIOS_ASSET_IDS.gallery1,
          APARTMENTS_STUDIOS_ASSET_IDS.gallery2,
          APARTMENTS_STUDIOS_ASSET_IDS.gallery3,
          APARTMENTS_STUDIOS_ASSET_IDS.gallery4,
        ],
        layout: "grid" as const,
      },
      {
        id: "f3000000-0000-4000-8000-000000000106",
        type: "amenities" as const,
        sortOrder: 5,
        visible: true,
        displayMode: "custom" as const,
        customItems: [
          { label: "Shared pool" },
          { label: "Self-catering kitchens" },
          { label: "Free Wi‑Fi" },
          { label: "Laundry room" },
          { label: "On-site parking" },
          { label: "Daily cleaning option" },
        ],
      },
      {
        id: "f3000000-0000-4000-8000-000000000107",
        type: "location" as const,
        sortOrder: 6,
        visible: true,
        showMap: true,
        directionsText:
          "Demo coastal lane — a short fictional walk to the promenade, bakery, and bus stop toward the old harbor.",
      },
      {
        id: "f3000000-0000-4000-8000-000000000108",
        type: "highlights" as const,
        sortOrder: 7,
        visible: true,
        settings: { purpose: "nearby" },
        items: [
          {
            title: "Promenade",
            text: "Evening ice cream and easy cycling paths.",
          },
          {
            title: "Sandy cove",
            text: "Eight quiet minutes on foot with shallow water.",
          },
          {
            title: "Village market",
            text: "Fresh fruit and bread two mornings a week.",
          },
        ],
      },
      {
        id: "f3000000-0000-4000-8000-000000000109",
        type: "faq" as const,
        sortOrder: 8,
        visible: true,
        items: [
          {
            question: "Is Nereida Apartments a real property?",
            answer:
              "No. This is fictional sample content for Talos Website Builder theme previews.",
          },
          {
            question: "Are kitchens fully equipped?",
            answer:
              "In this demo narrative, each unit includes cookware, fridge, and a dining table.",
          },
          {
            question: "How do guests book?",
            answer:
              "Use the booking call-to-action in the preview. Live booking connects later via Talos.",
          },
        ],
      },
      {
        id: "f3000000-0000-4000-8000-000000000110",
        type: "cta" as const,
        sortOrder: 9,
        visible: true,
        headline: "Find your studio dates",
        buttonLabel: "Check availability",
        buttonUrl: "/book",
      },
    ],
  });
}

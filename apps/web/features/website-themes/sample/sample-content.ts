import {
  parseWebsiteDraftContent,
  type WebsiteDraftContent,
  type WebsiteThemeId,
} from "@hcp/validators";

/** Deterministic UUIDs for sample assets (fictional — not real media). */
export const SAMPLE_ASSET_IDS = {
  hero: "a1000000-0000-4000-8000-000000000001",
  gallery1: "a1000000-0000-4000-8000-000000000002",
  gallery2: "a1000000-0000-4000-8000-000000000003",
  gallery3: "a1000000-0000-4000-8000-000000000004",
  gallery4: "a1000000-0000-4000-8000-000000000005",
  split: "a1000000-0000-4000-8000-000000000006",
} as const;

export const SAMPLE_PROPERTY_DISPLAY_NAME = "Villa Thalassa";

/**
 * Fictional Aegean accommodation sample for preview — no real guests/PMS data.
 */
export function buildSampleWebsiteDraftContent(
  themeId: WebsiteThemeId = "luxury_villa",
): WebsiteDraftContent {
  const raw = {
    contentSchemaVersion: 1 as const,
    locale: "en",
    themeId,
    seo: {
      metaTitle: "Villa Thalassa · Aegean cliffside retreat",
      metaDescription:
        "A fictional luxury villa sample for Talos Website Builder previews.",
    },
    sections: [
      {
        id: "b1000000-0000-4000-8000-000000000101",
        type: "hero" as const,
        sortOrder: 0,
        visible: true,
        headline: "Where the Aegean meets stillness",
        subheadline:
          "Four suites above turquoise water — private terraces, slow mornings, and evenings lit by olive oil lamps.",
        backgroundAssetId: SAMPLE_ASSET_IDS.hero,
        ctaLabel: "Check availability",
        ctaUrl: "/book",
      },
      {
        id: "b1000000-0000-4000-8000-000000000102",
        type: "richtext" as const,
        sortOrder: 1,
        visible: true,
        body: "<p>Villa Thalassa is a <strong>fictional</strong> cliffside home created for design previews. Stone walls hold the day’s heat; linen curtains move with the afternoon meltemi.</p><p>Guests gather on the lower terrace for long lunches — grilled fish, wild greens, and wine from the neighboring slope.</p>",
      },
      {
        id: "b1000000-0000-4000-8000-000000000103",
        type: "split" as const,
        sortOrder: 2,
        visible: true,
        assetId: SAMPLE_ASSET_IDS.split,
        headline: "Suites with their own horizon",
        body: "Each suite opens to a private veranda. Rain showers, hand-thrown ceramics, and beds dressed in washed linen.",
        imagePosition: "left" as const,
      },
      {
        id: "b1000000-0000-4000-8000-000000000104",
        type: "gallery" as const,
        sortOrder: 3,
        visible: true,
        assetIds: [
          SAMPLE_ASSET_IDS.gallery1,
          SAMPLE_ASSET_IDS.gallery2,
          SAMPLE_ASSET_IDS.gallery3,
          SAMPLE_ASSET_IDS.gallery4,
        ],
        layout: "grid" as const,
      },
      {
        id: "b1000000-0000-4000-8000-000000000105",
        type: "amenities" as const,
        sortOrder: 4,
        visible: true,
        displayMode: "custom" as const,
        customItems: [
          { label: "Infinity pool" },
          { label: "Chef’s kitchen" },
          { label: "Outdoor dining terrace" },
          { label: "Complimentary bicycles" },
          { label: "Daily housekeeping" },
          { label: "In-villa spa treatments" },
        ],
      },
      {
        id: "b1000000-0000-4000-8000-000000000106",
        type: "highlights" as const,
        sortOrder: 5,
        visible: true,
        items: [
          {
            title: "Master cliff suite",
            text: "King bed, dressing room, and a plunge deck above the cove.",
          },
          {
            title: "Garden suite",
            text: "Opens to citrus trees and a shaded daybed.",
          },
          {
            title: "Sea-view twin",
            text: "Ideal for friends traveling together — two twin beds, shared balcony.",
          },
        ],
      },
      {
        id: "b1000000-0000-4000-8000-000000000107",
        type: "location" as const,
        sortOrder: 6,
        visible: true,
        showMap: true,
        directionsText:
          "Fifteen quiet minutes above a fictional Cycladic harbor. A stone path leads to a pebble beach; the village square is a short walk for morning bread and evening ouzo.",
      },
      {
        id: "b1000000-0000-4000-8000-000000000108",
        type: "highlights" as const,
        sortOrder: 7,
        visible: true,
        settings: { purpose: "nearby" },
        items: [
          {
            title: "Hidden cove",
            text: "Swim before breakfast — five minutes on foot.",
          },
          {
            title: "Village taverna",
            text: "Grilled octopus and local white wine at dusk.",
          },
          {
            title: "Hill chapel",
            text: "Sunset views over neighboring islands.",
          },
        ],
      },
      {
        id: "b1000000-0000-4000-8000-000000000109",
        type: "faq" as const,
        sortOrder: 8,
        visible: true,
        items: [
          {
            question: "Is Villa Thalassa a real property?",
            answer:
              "No. This is sample preview content for Talos Website Builder themes.",
          },
          {
            question: "What is included in a stay?",
            answer:
              "In this fictional sample: daily breakfast basket, pool towels, and a welcome bottle of island wine.",
          },
          {
            question: "How do I book?",
            answer:
              "Use the booking call-to-action in the preview. Live booking connects later via the Talos Booking Engine.",
          },
        ],
      },
      {
        id: "b1000000-0000-4000-8000-000000000110",
        type: "cta" as const,
        sortOrder: 9,
        visible: true,
        headline: "Reserve your dates at Villa Thalassa",
        buttonLabel: "Check availability",
        buttonUrl: "/book",
      },
    ],
  };

  return parseWebsiteDraftContent(raw);
}

export const SAMPLE_WEBSITE_DRAFT_CONTENT = buildSampleWebsiteDraftContent();

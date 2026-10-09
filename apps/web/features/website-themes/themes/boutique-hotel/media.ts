import { BOUTIQUE_HOTEL_ASSET_IDS } from "../../sample/sample-boutique-hotel";

const BASE = "/website-themes/boutique-hotel";

/** Local fictional boutique-hotel placeholders — not Luxury Villa artwork. */
export const BOUTIQUE_HOTEL_MEDIA: Record<string, { src: string; alt: string }> =
  {
    [BOUTIQUE_HOTEL_ASSET_IDS.hero]: {
      src: `${BASE}/lobby.svg`,
      alt: "Demo placeholder — fictional boutique hotel lobby",
    },
    [BOUTIQUE_HOTEL_ASSET_IDS.split]: {
      src: `${BASE}/corridor.svg`,
      alt: "Demo placeholder — fictional hotel corridor",
    },
    [BOUTIQUE_HOTEL_ASSET_IDS.gallery1]: {
      src: `${BASE}/room.svg`,
      alt: "Demo placeholder — fictional guest room",
    },
    [BOUTIQUE_HOTEL_ASSET_IDS.gallery2]: {
      src: `${BASE}/courtyard.svg`,
      alt: "Demo placeholder — fictional courtyard",
    },
    [BOUTIQUE_HOTEL_ASSET_IDS.gallery3]: {
      src: `${BASE}/dining.svg`,
      alt: "Demo placeholder — fictional dining room",
    },
    [BOUTIQUE_HOTEL_ASSET_IDS.gallery4]: {
      src: `${BASE}/street.svg`,
      alt: "Demo placeholder — fictional street facade",
    },
  };

export function resolveBoutiqueHotelMedia(assetId: string | null | undefined): {
  src: string | null;
  alt: string;
} {
  if (!assetId) return { src: null, alt: "Image unavailable" };
  const hit = BOUTIQUE_HOTEL_MEDIA[assetId];
  if (hit) return hit;
  return { src: null, alt: "Image unavailable" };
}

import { SAMPLE_ASSET_IDS } from "../../sample/sample-content";

const BASE = "/website-themes/luxury-villa";

/** Local fictional placeholders — no external CDN, no customer media. */
export const LUXURY_VILLA_MEDIA: Record<string, { src: string; alt: string }> = {
  [SAMPLE_ASSET_IDS.hero]: {
    src: `${BASE}/hero.svg`,
    alt: "Demo placeholder — fictional cliffside villa at dusk",
  },
  [SAMPLE_ASSET_IDS.split]: {
    src: `${BASE}/suite.svg`,
    alt: "Demo placeholder — fictional suite interior",
  },
  [SAMPLE_ASSET_IDS.gallery1]: {
    src: `${BASE}/terrace.svg`,
    alt: "Demo placeholder — fictional sunlit terrace",
  },
  [SAMPLE_ASSET_IDS.gallery2]: {
    src: `${BASE}/pool.svg`,
    alt: "Demo placeholder — fictional infinity pool",
  },
  [SAMPLE_ASSET_IDS.gallery3]: {
    src: `${BASE}/garden.svg`,
    alt: "Demo placeholder — fictional garden path",
  },
  [SAMPLE_ASSET_IDS.gallery4]: {
    src: `${BASE}/cove.svg`,
    alt: "Demo placeholder — fictional pebble cove",
  },
};

export function resolveLuxuryVillaMedia(assetId: string | null | undefined): {
  src: string | null;
  alt: string;
} {
  if (!assetId) return { src: null, alt: "Image unavailable" };
  const hit = LUXURY_VILLA_MEDIA[assetId];
  if (hit) return hit;
  return { src: null, alt: "Image unavailable" };
}

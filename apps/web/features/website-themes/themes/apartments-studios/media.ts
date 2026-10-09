import { APARTMENTS_STUDIOS_ASSET_IDS } from "../../sample/sample-apartments-studios";

const BASE = "/website-themes/apartments-studios";

export const APARTMENTS_STUDIOS_MEDIA: Record<
  string,
  { src: string; alt: string }
> = {
  [APARTMENTS_STUDIOS_ASSET_IDS.hero]: {
    src: `${BASE}/balcony.svg`,
    alt: "Demo placeholder — fictional apartment balcony",
  },
  [APARTMENTS_STUDIOS_ASSET_IDS.split]: {
    src: `${BASE}/kitchen.svg`,
    alt: "Demo placeholder — fictional kitchenette",
  },
  [APARTMENTS_STUDIOS_ASSET_IDS.gallery1]: {
    src: `${BASE}/studio.svg`,
    alt: "Demo placeholder — fictional studio interior",
  },
  [APARTMENTS_STUDIOS_ASSET_IDS.gallery2]: {
    src: `${BASE}/pool.svg`,
    alt: "Demo placeholder — fictional pool terrace",
  },
  [APARTMENTS_STUDIOS_ASSET_IDS.gallery3]: {
    src: `${BASE}/street.svg`,
    alt: "Demo placeholder — fictional apartment facade",
  },
  [APARTMENTS_STUDIOS_ASSET_IDS.gallery4]: {
    src: `${BASE}/sea.svg`,
    alt: "Demo placeholder — fictional coastal vista",
  },
};

export function resolveApartmentsStudiosMedia(
  assetId: string | null | undefined,
): { src: string | null; alt: string } {
  if (!assetId) return { src: null, alt: "Image unavailable" };
  const hit = APARTMENTS_STUDIOS_MEDIA[assetId];
  if (hit) return hit;
  return { src: null, alt: "Image unavailable" };
}

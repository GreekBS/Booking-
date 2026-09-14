export interface OverlayToggles {
  price: boolean;
  minStay: boolean;
  maxStay: boolean;
  cta: boolean;
  ctd: boolean;
}

export const DEFAULT_OVERLAY_TOGGLES: OverlayToggles = {
  price: false,
  minStay: false,
  maxStay: false,
  cta: false,
  ctd: false,
};

export function countActiveOverlays(toggles: OverlayToggles): number {
  return (
    Number(toggles.price) +
    Number(toggles.minStay) +
    Number(toggles.maxStay) +
    Number(toggles.cta) +
    Number(toggles.ctd)
  );
}

export function hasAnyOverlay(toggles: OverlayToggles): boolean {
  return countActiveOverlays(toggles) > 0;
}

export function needsRatePlanData(toggles: OverlayToggles): boolean {
  return toggles.price;
}

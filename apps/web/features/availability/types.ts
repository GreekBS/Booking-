export interface CalendarFocus {
  unitId: string;
  date: string;
}

export interface CalendarSelection {
  unitId: string;
  from: string;
  to: string;
}

export interface UnitMeta {
  unitId: string;
  unitName: string;
  propertyId: string;
  propertyName: string;
}

export interface UnitRowData {
  meta: UnitMeta;
  calendar: import("@/lib/admin/types").CalendarRecord | undefined;
  rules: import("@/lib/admin/types").AvailabilityRulesRecord | undefined;
  ratePlan: import("@/lib/admin/types").RatePlanRecord | null | undefined;
  loading: boolean;
}

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

export function hasAnyRestrictionOverlay(overlays: OverlayToggles): boolean {
  return overlays.minStay || overlays.maxStay || overlays.cta || overlays.ctd;
}

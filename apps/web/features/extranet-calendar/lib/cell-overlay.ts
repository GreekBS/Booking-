import type { AvailabilityRulesRecord, RatePlanRecord } from "@/lib/admin/types";
import { dayOfWeekUtc } from "@/features/availability/lib/calendar-utils";
import { getNightlyRate } from "@/features/availability/lib/nightly-rates";
import type { OverlayToggles } from "./overlay-types";
import { countActiveOverlays } from "./overlay-types";

export interface CellOverlayItem {
  key: string;
  display: string;
  title: string;
  tone: "price" | "restriction" | "closed" | "open";
}

function isCheckInAllowed(rules: AvailabilityRulesRecord | undefined, date: string): boolean {
  if (!rules || rules.checkInDays.length === 0) return true;
  return rules.checkInDays.includes(dayOfWeekUtc(date));
}

function isCheckOutAllowed(rules: AvailabilityRulesRecord | undefined, date: string): boolean {
  if (!rules || rules.checkOutDays.length === 0) return true;
  return rules.checkOutDays.includes(dayOfWeekUtc(date));
}

export function buildCellOverlayItems(
  date: string,
  rules: AvailabilityRulesRecord | undefined,
  ratePlan: RatePlanRecord | null | undefined,
  toggles: OverlayToggles,
): CellOverlayItem[] {
  const items: CellOverlayItem[] = [];

  if (toggles.price) {
    const nightly = getNightlyRate(ratePlan, date);
    if (nightly) {
      const season = nightly.seasonName ? ` (${nightly.seasonName})` : "";
      const dow = nightly.hasDowModifier ? " · day-of-week rate" : "";
      items.push({
        key: "price",
        display: nightly.amount,
        title: `Nightly rate: ${nightly.amount} ${nightly.currency}${season}${dow}`,
        tone: "price",
      });
    } else {
      items.push({
        key: "price",
        display: "—",
        title: "Nightly rate unavailable",
        tone: "restriction",
      });
    }
  }

  if (toggles.minStay && rules) {
    items.push({
      key: "minStay",
      display: `${rules.minNights}n`,
      title: `Minimum stay: ${rules.minNights} night${rules.minNights !== 1 ? "s" : ""}`,
      tone: "restriction",
    });
  }

  if (toggles.maxStay && rules) {
    items.push({
      key: "maxStay",
      display: `${rules.maxNights}n`,
      title: `Maximum stay: ${rules.maxNights} night${rules.maxNights !== 1 ? "s" : ""}`,
      tone: "restriction",
    });
  }

  if (toggles.cta) {
    const allowed = isCheckInAllowed(rules, date);
    items.push({
      key: "cta",
      display: allowed ? "↓" : "CTA",
      title: allowed ? "Check-in allowed" : "Closed to arrival",
      tone: allowed ? "open" : "closed",
    });
  }

  if (toggles.ctd) {
    const allowed = isCheckOutAllowed(rules, date);
    items.push({
      key: "ctd",
      display: allowed ? "↑" : "CTD",
      title: allowed ? "Check-out allowed" : "Closed to departure",
      tone: allowed ? "open" : "closed",
    });
  }

  return items;
}

export function buildCellOverlayAria(items: CellOverlayItem[]): string {
  if (items.length === 0) return "";
  return items.map((item) => item.title).join("; ");
}

export function formatCompactOverlay(items: CellOverlayItem[]): string {
  return items.map((item) => item.display).join(" · ");
}

export function isCompactOverlayMode(toggles: OverlayToggles): boolean {
  return countActiveOverlays(toggles) > 1;
}

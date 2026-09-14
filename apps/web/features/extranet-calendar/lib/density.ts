export type CalendarDensity = "compact" | "comfortable";

export interface DensityTokens {
  dayWidthPx: number;
  rowHeightPx: number;
  propertyBandHeightPx: number;
  dayHeaderHeightPx: number;
  monthBandHeightPx: number;
}

export interface MonthGridTokens {
  cardMinHeightPx: number;
  gapPx: number;
}

export const DENSITY_TOKENS: Record<CalendarDensity, DensityTokens> = {
  compact: {
    dayWidthPx: 68,
    rowHeightPx: 56,
    propertyBandHeightPx: 52,
    dayHeaderHeightPx: 48,
    monthBandHeightPx: 40,
  },
  comfortable: {
    dayWidthPx: 90,
    rowHeightPx: 72,
    propertyBandHeightPx: 64,
    dayHeaderHeightPx: 60,
    monthBandHeightPx: 52,
  },
};

export const DEFAULT_DENSITY: CalendarDensity = "comfortable";

/** @deprecated Use DENSITY_TOKENS — kept for backwards references during migration */
export const DAY_WIDTH_PX = DENSITY_TOKENS.comfortable.dayWidthPx;
export const ROW_HEIGHT_PX = DENSITY_TOKENS.comfortable.rowHeightPx;
export const PROPERTY_BAND_HEIGHT_PX = DENSITY_TOKENS.comfortable.propertyBandHeightPx;
export const DAY_HEADER_HEIGHT_PX = DENSITY_TOKENS.comfortable.dayHeaderHeightPx;
export const MONTH_BAND_HEIGHT_PX = DENSITY_TOKENS.comfortable.monthBandHeightPx;

export function getDensityTokens(density: CalendarDensity): DensityTokens {
  return DENSITY_TOKENS[density];
}

export function getTimelineHeaderHeightPx(density: CalendarDensity): number {
  const t = getDensityTokens(density);
  return t.monthBandHeightPx + t.dayHeaderHeightPx;
}

const MONTH_GRID_TOKENS: Record<CalendarDensity, MonthGridTokens> = {
  compact: { cardMinHeightPx: 80, gapPx: 6 },
  comfortable: { cardMinHeightPx: 96, gapPx: 8 },
};

export function getMonthGridTokens(density: CalendarDensity): MonthGridTokens {
  return MONTH_GRID_TOKENS[density];
}

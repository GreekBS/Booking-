import {
  MONTH_GRID_COLUMNS_MAX,
  MONTH_GRID_COLUMNS_MIN,
} from "./month-grid-model";

export interface ResolveMonthGridColumnsOptions {
  minCellWidthPx: number;
  gapPx: number;
  minColumns?: number;
  maxColumns?: number;
}

/**
 * Deterministic column count from measured container width.
 * Formula: floor((width + gap) / (minCell + gap)), then clamp.
 */
export function resolveMonthGridColumns(
  widthPx: number,
  options: ResolveMonthGridColumnsOptions,
): number {
  const minColumns = options.minColumns ?? MONTH_GRID_COLUMNS_MIN;
  const maxColumns = options.maxColumns ?? MONTH_GRID_COLUMNS_MAX;
  const minCell = Math.max(1, options.minCellWidthPx);
  const gap = Math.max(0, options.gapPx);

  if (!Number.isFinite(widthPx) || widthPx <= 0) {
    return minColumns;
  }

  const raw = Math.floor((widthPx + gap) / (minCell + gap));
  return Math.min(maxColumns, Math.max(minColumns, raw));
}

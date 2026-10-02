import { describe, expect, it } from "vitest";
import {
  MONTH_GRID_COLUMNS_DEFAULT,
  MONTH_GRID_COLUMNS_MAX,
  MONTH_GRID_COLUMNS_MIN,
} from "@/features/extranet-calendar/lib/month-grid-model";
import { getMonthGridTokens } from "@/features/extranet-calendar/lib/density";
import { resolveMonthGridColumns } from "@/features/extranet-calendar/lib/resolve-month-grid-columns";

describe("resolveMonthGridColumns", () => {
  const comfortable = getMonthGridTokens("comfortable");
  const compact = getMonthGridTokens("compact");

  it("clamps to min and max", () => {
    expect(
      resolveMonthGridColumns(0, {
        minCellWidthPx: comfortable.minCellWidthPx,
        gapPx: comfortable.gapPx,
      }),
    ).toBe(MONTH_GRID_COLUMNS_MIN);
    expect(
      resolveMonthGridColumns(40, {
        minCellWidthPx: comfortable.minCellWidthPx,
        gapPx: comfortable.gapPx,
      }),
    ).toBe(MONTH_GRID_COLUMNS_MIN);
    expect(
      resolveMonthGridColumns(10_000, {
        minCellWidthPx: comfortable.minCellWidthPx,
        gapPx: comfortable.gapPx,
      }),
    ).toBe(MONTH_GRID_COLUMNS_MAX);
  });

  it("uses density-aware thresholds for comfortable (72px / gap 8)", () => {
    const opts = {
      minCellWidthPx: comfortable.minCellWidthPx,
      gapPx: comfortable.gapPx,
    };
    // 9 cols need: 9*72 + 8*8 = 648+64 = 712
    expect(resolveMonthGridColumns(711, opts)).toBe(8);
    expect(resolveMonthGridColumns(712, opts)).toBe(9);
    // 8 cols: 8*72 + 7*8 = 576+56 = 632
    expect(resolveMonthGridColumns(631, opts)).toBe(7);
    expect(resolveMonthGridColumns(632, opts)).toBe(8);
    // 10 cols: 10*72 + 9*8 = 720+72 = 792
    expect(resolveMonthGridColumns(791, opts)).toBe(9);
    expect(resolveMonthGridColumns(792, opts)).toBe(10);
  });

  it("uses density-aware thresholds for compact (64px / gap 6)", () => {
    const opts = {
      minCellWidthPx: compact.minCellWidthPx,
      gapPx: compact.gapPx,
    };
    // 9 cols: 9*64 + 8*6 = 576+48 = 624
    expect(resolveMonthGridColumns(623, opts)).toBe(8);
    expect(resolveMonthGridColumns(624, opts)).toBe(9);
  });

  it("keeps DEFAULT_DENSITY as compact for Availability adaptive columns", () => {
    expect(MONTH_GRID_COLUMNS_DEFAULT).toBe(9);
    expect(MONTH_GRID_COLUMNS_MIN).toBe(4);
    expect(MONTH_GRID_COLUMNS_MAX).toBe(12);
    expect(getMonthGridTokens("compact").minCellWidthPx).toBe(64);
  });
});

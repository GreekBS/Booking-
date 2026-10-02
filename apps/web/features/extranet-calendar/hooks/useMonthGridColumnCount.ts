"use client";

import { useCallback, useEffect, useState } from "react";
import { getMonthGridTokens, type CalendarDensity } from "../lib/density";
import { MONTH_GRID_COLUMNS_DEFAULT } from "../lib/month-grid-model";
import { resolveMonthGridColumns } from "../lib/resolve-month-grid-columns";

/**
 * Measures a month-grid content node and resolves adaptive column count.
 * SSR / first paint uses MONTH_GRID_COLUMNS_DEFAULT until ResizeObserver runs.
 */
export function useMonthGridColumnCount(density: CalendarDensity) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [columns, setColumns] = useState(MONTH_GRID_COLUMNS_DEFAULT);
  const measureRef = useCallback((el: HTMLElement | null) => {
    setNode(el);
  }, []);

  const tokens = getMonthGridTokens(density);
  const minCellWidthPx = tokens.minCellWidthPx;
  const gapPx = tokens.gapPx;

  useEffect(() => {
    if (!node) return;

    let raf = 0;
    const update = () => {
      const next = resolveMonthGridColumns(node.clientWidth, {
        minCellWidthPx,
        gapPx,
      });
      setColumns((prev) => (prev === next ? prev : next));
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [node, minCellWidthPx, gapPx]);

  return { columns, measureRef };
}

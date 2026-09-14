"use client";

import { cn } from "@/lib/utils";
import type { CellOverlayItem } from "../../lib/cell-overlay";
import { formatCompactOverlay, isCompactOverlayMode } from "../../lib/cell-overlay";
import { useOverlays } from "../../context/OverlayContext";
import { OVERLAY_META_CLASS, PRICE_OVERLAY_CLASS } from "../../lib/visual-theme";

interface CellOverlayLayerProps {
  items: CellOverlayItem[];
  compact?: boolean;
  positionClassName?: string;
}

function toneClassName(tone: CellOverlayItem["tone"]): string {
  switch (tone) {
    case "price":
      return PRICE_OVERLAY_CLASS;
    default:
      return OVERLAY_META_CLASS;
  }
}

export function CellOverlayLayer({ items, compact, positionClassName }: CellOverlayLayerProps) {
  const { overlays } = useOverlays();

  if (items.length === 0) return null;

  const useCompact = compact ?? isCompactOverlayMode(overlays);
  const anchorClass = positionClassName ?? "bottom-1.5 right-1.5";

  if (useCompact) {
    return (
      <span
        className={cn(
          "pointer-events-none absolute z-[1] max-w-[calc(100%-8px)] truncate text-right text-[10px] leading-none tabular-nums text-[#6b7280] dark:text-muted-foreground",
          anchorClass,
        )}
        title={items.map((item) => item.title).join(" · ")}
        aria-hidden
      >
        {formatCompactOverlay(items)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "pointer-events-none absolute z-[1] flex max-w-[calc(100%-8px)] flex-col items-end gap-0.5",
        anchorClass,
      )}
      aria-hidden
    >
      {items.map((item) => (
        <span
          key={item.key}
          className={cn("truncate text-right leading-tight tabular-nums", toneClassName(item.tone))}
          title={item.title}
        >
          {item.display}
        </span>
      ))}
    </span>
  );
}

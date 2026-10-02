import type { FocusScrollMode, TimelineFocus } from "../types";

/** Resolve scroll intent for a focus update. Pointer defaults to no scroll. */
export function resolveFocusScrollMode(focus: Pick<TimelineFocus, "scroll"> | null): FocusScrollMode {
  return focus?.scroll ?? "none";
}

/**
 * Options for month-grid `scrollIntoView`, or `null` when pointer focus must
 * leave the scroller alone.
 */
export function scrollIntoViewOptionsForFocusMode(
  mode: FocusScrollMode,
): ScrollIntoViewOptions | null {
  if (mode === "none") return null;
  if (mode === "nearest") {
    // Keyboard: only move if the destination is outside the visible area.
    return { block: "nearest", behavior: "auto" };
  }
  // Explicit navigation (Today): intentional centering.
  return { block: "center", behavior: "smooth" };
}

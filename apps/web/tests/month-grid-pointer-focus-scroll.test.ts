import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveFocusScrollMode,
  scrollIntoViewOptionsForFocusMode,
} from "@/features/extranet-calendar/lib/focus-scroll";
import { focusCellAfterTodayJump } from "@/features/extranet-calendar/hooks/useExtranetCalendarKeyboard";
import type { TimelineFocus } from "@/features/extranet-calendar/types";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Month-grid pointer vs keyboard focus scroll", () => {
  it("pointer focus defaults to no automatic scrollIntoView", () => {
    expect(resolveFocusScrollMode({ unitId: "u1", date: "2026-11-25" })).toBe("none");
    expect(resolveFocusScrollMode({ unitId: "u1", date: "2026-11-25", scroll: "none" })).toBe(
      "none",
    );
    expect(scrollIntoViewOptionsForFocusMode("none")).toBeNull();
  });

  it("keyboard focus uses nearest visibility scrolling, not center", () => {
    expect(resolveFocusScrollMode({ unitId: "u1", date: "2026-11-25", scroll: "nearest" })).toBe(
      "nearest",
    );
    expect(scrollIntoViewOptionsForFocusMode("nearest")).toEqual({
      block: "nearest",
      behavior: "auto",
    });
  });

  it("Today / explicit navigation keeps intentional center scroll", () => {
    expect(resolveFocusScrollMode({ unitId: "u1", date: "2026-10-02", scroll: "center" })).toBe(
      "center",
    );
    expect(scrollIntoViewOptionsForFocusMode("center")).toEqual({
      block: "center",
      behavior: "smooth",
    });

    const calls: TimelineFocus[] = [];
    focusCellAfterTodayJump(
      ["2026-10-01", "2026-10-02", "2026-10-03"],
      "2026-10-02",
      (focus) => calls.push(focus),
      "unit-1",
    );
    expect(calls).toEqual([{ unitId: "unit-1", date: "2026-10-02", scroll: "center" }]);
  });

  it("bindings gate scrollToDate on focus.scroll and keep preventScroll focus", () => {
    const bindings = read(
      "features/extranet-calendar/components/ops/CalendarKeyboardBindings.tsx",
    );
    expect(bindings).toContain("resolveFocusScrollMode");
    expect(bindings).toContain("scrollIntoViewOptionsForFocusMode");
    expect(bindings).toContain("scrollToDate(focus.date, scrollOptions)");
    expect(bindings).toContain('el?.focus({ preventScroll: true })');
    expect(bindings).not.toMatch(/scrollToDate\(focus\.date\)\s*;/);
  });

  it("pointer cell handlers do not request center/nearest scroll on setFocus", () => {
    const interaction = read(
      "features/extranet-calendar/context/TimelineInteractionContext.tsx",
    );
    expect(interaction).toContain("setFocus({ unitId, date })");
    expect(interaction).not.toContain('scroll: "center"');
    expect(interaction).not.toContain('scroll: "nearest"');

    const dayCard = read(
      "features/extranet-calendar/components/month-grid/MonthGridDayCard.tsx",
    );
    expect(dayCard).toContain("openWorkspaceForCell(unit, date)");
    expect(dayCard).toContain("onCellClick(unit.unitId, date)");
    expect(dayCard).not.toContain("preventDefault()");
  });

  it("keyboard navigation requests nearest scroll and uses columnsPerRow", () => {
    const keyboard = read(
      "features/extranet-calendar/hooks/useExtranetCalendarKeyboard.ts",
    );
    expect(keyboard).toContain('scroll: "nearest"');
    expect(keyboard).toContain("columnsPerRow");
    expect(keyboard).toContain("rowStep");
    expect(keyboard).toContain('scroll: "center"'); // Today helper
  });

  it("viewport scrollToDate accepts ScrollIntoView options without defaulting pointer to center", () => {
    const viewport = read(
      "features/extranet-calendar/components/month-grid/MonthGridViewport.tsx",
    );
    expect(viewport).toContain("options?: ScrollIntoViewOptions");
    expect(viewport).toContain("el?.scrollIntoView(");
    expect(viewport).toContain("options ??");
  });
});

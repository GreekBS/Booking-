import { describe, expect, it } from "vitest";
import { classifyImportStayTemporalClass } from "../../src/commerce/import/ImportStayTemporalClass";

describe("classifyImportStayTemporalClass", () => {
  const today = "2026-10-03";

  it("classifies checkout yesterday as historical", () => {
    expect(classifyImportStayTemporalClass("2026-09-28", "2026-10-02", today)).toBe(
      "historical",
    );
  });

  it("classifies checkout today as historical", () => {
    expect(classifyImportStayTemporalClass("2026-09-28", "2026-10-03", today)).toBe(
      "historical",
    );
  });

  it("classifies started yesterday / checkout tomorrow as in_progress", () => {
    expect(classifyImportStayTemporalClass("2026-10-01", "2026-10-07", today)).toBe(
      "in_progress",
    );
  });

  it("classifies check-in today as future", () => {
    expect(classifyImportStayTemporalClass("2026-10-03", "2026-10-08", today)).toBe(
      "future",
    );
  });

  it("classifies future stay as future", () => {
    expect(classifyImportStayTemporalClass("2026-11-10", "2026-11-15", today)).toBe(
      "future",
    );
  });

  it("classifies fully past September stay as historical", () => {
    expect(classifyImportStayTemporalClass("2026-09-01", "2026-09-05", today)).toBe(
      "historical",
    );
  });
});

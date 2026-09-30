import { describe, expect, it } from "vitest";
import {
  displayUnitName,
  INTERNAL_ENTIRE_PROPERTY_UNIT_NAME,
  elCommon,
} from "@/lib/i18n";

describe("displayUnitName", () => {
  it("maps the internal default whole-property name to Greek", () => {
    expect(displayUnitName(INTERNAL_ENTIRE_PROPERTY_UNIT_NAME)).toBe(
      elCommon.entireProperty,
    );
    expect(elCommon.entireProperty).toBe("Ολόκληρο κατάλυμα");
  });

  it("preserves custom unit names", () => {
    expect(displayUnitName("Suite A")).toBe("Suite A");
    expect(displayUnitName("Δωμάτιο Θάλασσα")).toBe("Δωμάτιο Θάλασσα");
  });

  it("uses an em dash for missing names", () => {
    expect(displayUnitName(null)).toBe("—");
    expect(displayUnitName(undefined)).toBe("—");
    expect(displayUnitName("")).toBe("—");
    expect(displayUnitName("   ")).toBe("—");
  });
});

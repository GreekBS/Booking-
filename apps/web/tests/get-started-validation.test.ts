import { describe, expect, it } from "vitest";
import {
  createEmptyFormState,
} from "@/features/get-started/types";
import {
  toCreateLeadPayload,
  validateFullForm,
  validateStep,
} from "@/features/get-started/validation";
import {
  INTEREST_OPTIONS,
  PORTFOLIO_OPTIONS,
  RELATIONSHIP_OPTIONS,
  REVENUE_OPTIONS,
} from "@/features/get-started/options";

function filledState() {
  return {
    ...createEmptyFormState({
      source: "homepage_hero",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      submissionId: "11111111-1111-4111-8111-111111111111",
    }),
    fullName: "Ada Owner",
    email: "ada@example.com",
    country: "Greece",
    relationship: "owner" as const,
    portfolioSize: "two_to_five" as const,
    accommodationTypes: ["villa" as const],
    propertyCountry: "Greece",
    operatingState: "operating" as const,
    interests: ["run" as const],
  };
}

describe("get-started validation mapping", () => {
  it("maps UI option values to Phase 1 enum contracts", () => {
    expect(RELATIONSHIP_OPTIONS.map((o) => o.value)).toEqual([
      "owner",
      "property_manager",
      "hospitality_business",
      "other",
    ]);
    expect(PORTFOLIO_OPTIONS.map((o) => o.value)).toEqual([
      "one",
      "two_to_five",
      "six_to_ten",
      "eleven_to_twenty_five",
      "twenty_six_to_fifty",
      "fifty_one_plus",
    ]);
    expect(REVENUE_OPTIONS.map((o) => o.value)).toContain("prefer_not_to_say");
    expect(INTEREST_OPTIONS.map((o) => o.value)).toEqual([
      "run",
      "grow",
      "managed",
      "unsure",
    ]);
  });

  it("requires step 1 identity fields", () => {
    const empty = createEmptyFormState({
      source: "other",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    });
    const errors = validateStep(empty, 1);
    expect(errors.fullName).toBeTruthy();
    expect(errors.email).toBeTruthy();
    expect(errors.country).toBeTruthy();
    expect(errors.relationship).toBeTruthy();
    expect(errors.phone).toBeUndefined();
  });

  it("allows optional phone and revenue to remain absent", () => {
    const state = filledState();
    expect(validateStep(state, 1)).toEqual({});
    expect(validateStep(state, 4)).toEqual({});
    const full = validateFullForm(state);
    expect(full.ok).toBe(true);
    if (full.ok) {
      expect(full.data.phone).toBeNull();
      expect(full.data.revenueRange).toBeNull();
    }
  });

  it("requires accommodation types and interests", () => {
    const state = filledState();
    state.accommodationTypes = [];
    expect(validateStep(state, 2).accommodationTypes).toBeTruthy();
    state.accommodationTypes = ["villa"];
    state.interests = [];
    expect(validateStep(state, 5).interests).toBeTruthy();
  });

  it("preselects managed for property_management entry", () => {
    const state = createEmptyFormState({
      source: "property_management",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      preselectManaged: true,
    });
    expect(state.interests).toEqual(["managed"]);
  });

  it("builds a payload accepted by createLeadSchema", () => {
    const payload = toCreateLeadPayload(filledState());
    expect(payload.source).toBe("homepage_hero");
    expect(payload.submissionId).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(payload.relationship).toBe("owner");
  });
});

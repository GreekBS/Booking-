import { describe, it, expect } from "vitest";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import { TaxEngine } from "../../src/billing/tax/TaxEngine";
import { greekStatutoryTaxRules } from "../../src/billing/tax/greekStatutoryTaxRules";
import { resolveTaxRule } from "../../src/billing/tax/resolveTaxRule";
import {
  BusinessFiscalProfile,
} from "../../src/fiscal/domain/FiscalProfiles";
import {
  GreekFiscalJurisdictionResolver,
} from "../../src/fiscal/jurisdiction/GreekFiscalJurisdictionResolver";
import type { GreekFiscalLocationRecord } from "../../src/fiscal/jurisdiction/greekFiscalJurisdictionCatalog";
import { ConflictError, ValidationError } from "../../src/shared/errors/DomainError";

const engine = new TaxEngine();
const rules = greekStatutoryTaxRules();
const resolver = new GreekFiscalJurisdictionResolver();

const addr = {
  line1: "1 Street",
  line2: null,
  city: "Athens",
  region: null,
  postalCode: "10552",
  country: "GR",
};

function profile(input: {
  establishmentLocationId: string;
  establishmentInEligibleArea?: boolean;
  servicePhysicallyExecutedInEligibleArea?: boolean;
  now?: Date;
}) {
  return BusinessFiscalProfile.create({
    id: "b1",
    tenantId: "t1",
    propertyId: "p1",
    legalName: "Hotel SA",
    tradeName: null,
    country: "GR",
    vatNumber: "123456789",
    address: addr,
    establishmentLocationId: input.establishmentLocationId,
    establishmentInEligibleArea: input.establishmentInEligibleArea ?? false,
    servicePhysicallyExecutedInEligibleArea:
      input.servicePhysicallyExecutedInEligibleArea ?? false,
    establishmentCode: null,
    accommodationType: "hotel",
    propertyClassification: "hotel_stars_3",
    floorAreaSqm: null,
    metadata: {},
    now: input.now,
  });
}

describe("F2.1 Greek fiscal jurisdiction catalog + resolver", () => {
  it("normal GR mainland establishment → GR", () => {
    const p = profile({ establishmentLocationId: "gr-mainland" });
    expect(p.fiscalJurisdiction).toBe("GR");
    expect(
      resolver.resolve({
        establishmentLocationId: "gr-mainland",
        asOf: new Date("2026-06-01T12:00:00.000Z"),
        establishmentInEligibleArea: false,
        servicePhysicallyExecutedInEligibleArea: false,
      }).jurisdiction,
    ).toBe("GR");
  });

  it("eligible 2026 island establishment → GR-ISLAND-REDUCED", () => {
    const p = profile({
      establishmentLocationId: "gr-island:limnos",
      establishmentInEligibleArea: true,
      servicePhysicallyExecutedInEligibleArea: true,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(p.fiscalJurisdiction).toBe("GR-ISLAND-REDUCED");
  });

  it("continuing Art.26 island (Lesvos) eligible before 2026", () => {
    const p = profile({
      establishmentLocationId: "gr-island:lesvos",
      establishmentInEligibleArea: true,
      servicePhysicallyExecutedInEligibleArea: true,
      now: new Date("2022-01-01T12:00:00.000Z"),
    });
    expect(p.fiscalJurisdiction).toBe("GR-ISLAND-REDUCED");
  });

  it("ineligible Greek establishment (Crete) → GR", () => {
    const p = profile({
      establishmentLocationId: "gr-other:crete",
      establishmentInEligibleArea: true,
      servicePhysicallyExecutedInEligibleArea: true,
    });
    expect(p.fiscalJurisdiction).toBe("GR");
  });

  it("insufficient location data fails closed", () => {
    expect(() =>
      resolver.resolve({
        establishmentLocationId: "",
        asOf: new Date("2026-06-01"),
        establishmentInEligibleArea: true,
        servicePhysicallyExecutedInEligibleArea: true,
      }),
    ).toThrow(ValidationError);

    expect(() =>
      resolver.resolve({
        establishmentLocationId: "gr-island:unknown-place",
        asOf: new Date("2026-06-01"),
        establishmentInEligibleArea: true,
        servicePhysicallyExecutedInEligibleArea: true,
      }),
    ).toThrow(ValidationError);
  });

  it("conflicting catalog entry fails closed", () => {
    const dup: GreekFiscalLocationRecord = {
      locationId: "gr-island:limnos",
      displayNameEl: "Λήμνος",
      displayNameEn: "Limnos",
      kind: "eligible_island",
      eligibleForReducedVat: true,
      validFrom: "2026-01-01",
      validUntil: null,
      legalSource: "dup",
      legalVersion: "dup",
    };
    const conflicting = new GreekFiscalJurisdictionResolver([dup, { ...dup }]);
    expect(() =>
      conflicting.resolve({
        establishmentLocationId: "gr-island:limnos",
        asOf: new Date("2026-06-01"),
        establishmentInEligibleArea: true,
        servicePhysicallyExecutedInEligibleArea: true,
      }),
    ).toThrow(ConflictError);
  });

  it("effective-date transition: 2026 expansion island before validFrom fails", () => {
    expect(() =>
      resolver.resolve({
        establishmentLocationId: "gr-island:limnos",
        asOf: new Date("2025-12-15T12:00:00.000Z"),
        establishmentInEligibleArea: true,
        servicePhysicallyExecutedInEligibleArea: true,
      }),
    ).toThrow(ValidationError);

    expect(
      resolver.resolve({
        establishmentLocationId: "gr-island:limnos",
        asOf: new Date("2026-01-01T12:00:00.000Z"),
        establishmentInEligibleArea: true,
        servicePhysicallyExecutedInEligibleArea: true,
      }).jurisdiction,
    ).toBe("GR-ISLAND-REDUCED");
  });

  it("eligible island without service conditions fails closed (no silent GR)", () => {
    expect(() =>
      profile({
        establishmentLocationId: "gr-island:kos",
        establishmentInEligibleArea: false,
        servicePhysicallyExecutedInEligibleArea: true,
        now: new Date("2026-06-01"),
      }),
    ).toThrow(ValidationError);
  });

  it("reduced VAT 13 → 9 for accommodation via resolved jurisdiction", () => {
    const rule = resolveTaxRule(rules, {
      taxType: "vat",
      classificationKey: "vat:accommodation",
      chargeCategory: "accommodation",
      accommodationType: null,
      propertyClassification: null,
      jurisdiction: "GR-ISLAND-REDUCED",
      country: "GR",
      asOf: new Date("2026-06-15T12:00:00.000Z"),
      seasonMonth: 6,
      floorAreaSqm: null,
      tenantId: "t1",
    });
    expect(rule.ratePercent).toBe("9.0000");

    const evaluation = engine.evaluate(
      {
        tenantId: "t1",
        country: "GR",
        jurisdiction: "GR-ISLAND-REDUCED",
        currency: "EUR",
        asOf: new Date("2026-06-15T12:00:00.000Z"),
        accommodationType: "hotel",
        propertyClassification: "hotel_stars_3",
        floorAreaSqm: null,
        stayNightDates: ["2026-06-15"],
        roomOrApartmentCount: 1,
        guestCount: 1,
        complimentaryStay: false,
        amountBasis: "NET",
        lines: [
          {
            lineId: "l1",
            chargeCategory: "accommodation",
            amount: Money.create("100.0000", "EUR"),
          },
        ],
      },
      rules,
    );
    const vat = evaluation.components.find((c) => c.taxType === "vat");
    expect(vat?.appliedRatePercent).toBe("9.0000");
    expect(vat?.calculatedAmount).toBe("9.0000");
  });

  it("reduced VAT 24 → 17 for extras via resolved jurisdiction", () => {
    const evaluation = engine.evaluate(
      {
        tenantId: "t1",
        country: "GR",
        jurisdiction: "GR-ISLAND-REDUCED",
        currency: "EUR",
        asOf: new Date("2026-06-15T12:00:00.000Z"),
        accommodationType: "hotel",
        propertyClassification: "hotel_stars_3",
        floorAreaSqm: null,
        stayNightDates: ["2026-06-15"],
        roomOrApartmentCount: 1,
        guestCount: 1,
        complimentaryStay: false,
        amountBasis: "NET",
        lines: [
          {
            lineId: "l2",
            chargeCategory: "extra",
            amount: Money.create("100.0000", "EUR"),
          },
        ],
      },
      rules,
    );
    const vat = evaluation.components.find((c) => c.taxType === "vat");
    expect(vat?.appliedRatePercent).toBe("17.0000");
    expect(vat?.calculatedAmount).toBe("17.0000");
  });

  it("no operator-forced reduced jurisdiction bypass on create/update", () => {
    expect(() =>
      BusinessFiscalProfile.create({
        id: "b1",
        tenantId: "t1",
        propertyId: "p1",
        legalName: "Hotel SA",
        tradeName: null,
        country: "GR",
        vatNumber: "123456789",
        address: addr,
        establishmentLocationId: "gr-mainland",
        establishmentInEligibleArea: false,
        servicePhysicallyExecutedInEligibleArea: false,
        fiscalJurisdiction: "GR-ISLAND-REDUCED",
        establishmentCode: null,
        accommodationType: "hotel",
        propertyClassification: "hotel_stars_3",
        floorAreaSqm: null,
        metadata: {},
      }),
    ).toThrow(ValidationError);

    const p = profile({ establishmentLocationId: "gr-mainland" });
    expect(() =>
      p.update({ fiscalJurisdiction: "GR-ISLAND-REDUCED" }),
    ).toThrow(ValidationError);
    expect(p.fiscalJurisdiction).toBe("GR");
  });

  it("TaxEngine has no island-name geography branching (jurisdiction code only)", () => {
    // Same engine path for GR vs GR-ISLAND-REDUCED — rates differ solely by rule match.
    const mk = (jurisdiction: string) =>
      engine.evaluate(
        {
          tenantId: "t1",
          country: "GR",
          jurisdiction,
          currency: "EUR",
          asOf: new Date("2026-06-15T12:00:00.000Z"),
          accommodationType: "hotel",
          propertyClassification: "hotel_stars_3",
          floorAreaSqm: null,
          stayNightDates: ["2026-06-15"],
          roomOrApartmentCount: 1,
          guestCount: 1,
          complimentaryStay: false,
          amountBasis: "NET",
          lines: [
            {
              lineId: "l1",
              chargeCategory: "accommodation",
              amount: Money.create("100.0000", "EUR"),
            },
          ],
        },
        rules,
      );
    expect(mk("GR").components.find((c) => c.taxType === "vat")?.appliedRatePercent).toBe(
      "13.0000",
    );
    expect(
      mk("GR-ISLAND-REDUCED").components.find((c) => c.taxType === "vat")
        ?.appliedRatePercent,
    ).toBe("9.0000");
  });
});

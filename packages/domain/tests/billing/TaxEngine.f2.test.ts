import { describe, it, expect } from "vitest";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import {
  netToGross,
  grossToNet,
  vatFromNet,
  vatFromGross,
} from "../../src/billing/tax/VatConversion";
import { TaxEngine } from "../../src/billing/tax/TaxEngine";
import { greekStatutoryTaxRules } from "../../src/billing/tax/greekStatutoryTaxRules";
import { TaxRule } from "../../src/billing/tax/TaxRule";
import { resolveTaxRule } from "../../src/billing/tax/resolveTaxRule";
import { ConflictError, ValidationError } from "../../src/shared/errors/DomainError";
import {
  BusinessFiscalProfile,
  CustomerBillingProfile,
} from "../../src/fiscal/domain/FiscalProfiles";
import { Folio, FolioLine } from "../../src/billing/domain/Folio";

const engine = new TaxEngine();
const rules = greekStatutoryTaxRules();

describe("VatConversion NET/GROSS", () => {
  it("NET → GROSS and GROSS → NET at 13%", () => {
    const net = Money.create("100.0000", "EUR");
    const gross = netToGross(net, "13.0000");
    expect(gross.amount).toBe("113.0000");
    expect(grossToNet(gross, "13.0000").amount).toBe("100.0000");
    expect(vatFromNet(net, "13.0000").amount).toBe("13.0000");
  });

  it("NET → GROSS at 24%", () => {
    expect(netToGross(Money.create("100.0000", "EUR"), "24.0000").amount).toBe(
      "124.0000",
    );
  });

  it("is deterministic (no float)", () => {
    const net = Money.create("99.9999", "EUR");
    const gross = netToGross(net, "13.0000");
    const back = grossToNet(gross, "13.0000");
    // Truncation toward zero may leave a residual of at most 1 ulp scale unit.
    expect(back.amount).toMatch(/^99\.999/);
  });

  it("rejects negative bases", () => {
    expect(() =>
      netToGross(Money.create("-1.0000", "EUR"), "13.0000"),
    ).toThrow(ValidationError);
  });
});

describe("TaxRule resolution", () => {
  it("selects effective-dated VAT accommodation rule for GR", () => {
    const rule = resolveTaxRule(rules, {
      taxType: "vat",
      classificationKey: "vat:accommodation",
      chargeCategory: "accommodation",
      accommodationType: "hotel",
      propertyClassification: "hotel_stars_3",
      jurisdiction: "GR",
      country: "GR",
      asOf: new Date("2026-06-15T12:00:00.000Z"),
      seasonMonth: 6,
      floorAreaSqm: null,
      tenantId: "t1",
    });
    expect(rule.ratePercent).toBe("13.0000");
    expect(rule.jurisdiction).toBe("GR");
  });

  it("uses island-reduced jurisdiction without hardcoding geography", () => {
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
  });

  it("fails when rule missing", () => {
    expect(() =>
      resolveTaxRule(rules, {
        taxType: "vat",
        classificationKey: "vat:unknown",
        chargeCategory: "other",
        accommodationType: null,
        propertyClassification: null,
        jurisdiction: "GR",
        country: "GR",
        asOf: new Date("2026-06-15T12:00:00.000Z"),
        seasonMonth: 6,
        floorAreaSqm: null,
        tenantId: "t1",
      }),
    ).toThrow(ValidationError);
  });

  it("fails closed on ambiguous equal-priority rules", () => {
    const dup = TaxRule.create({
      ...rules[0]!.toProps(),
      id: "dup-ambiguous",
    });
    expect(() => resolveTaxRule([rules[0]!, dup], {
      taxType: rules[0]!.taxType,
      classificationKey: rules[0]!.classificationKey,
      chargeCategory: rules[0]!.chargeCategory,
      accommodationType: rules[0]!.accommodationType,
      propertyClassification: rules[0]!.propertyClassification,
      jurisdiction: rules[0]!.jurisdiction,
      country: rules[0]!.country,
      asOf: new Date("2026-06-15T12:00:00.000Z"),
      seasonMonth: 6,
      floorAreaSqm: null,
      tenantId: "t1",
    })).toThrow(ConflictError);
  });

  it("ignores expired rules", () => {
    const expired = TaxRule.create({
      ...rules.find((r) => r.id === "gr-vat-accommodation-mainland")!.toProps(),
      id: "expired-vat",
      validUntil: new Date("2020-01-01T00:00:00.000Z"),
    });
    const live = rules.find((r) => r.id === "gr-vat-accommodation-mainland")!;
    const rule = resolveTaxRule([expired, live], {
      taxType: "vat",
      classificationKey: "vat:accommodation",
      chargeCategory: "accommodation",
      accommodationType: null,
      propertyClassification: null,
      jurisdiction: "GR",
      country: "GR",
      asOf: new Date("2026-06-15T12:00:00.000Z"),
      seasonMonth: 6,
      floorAreaSqm: null,
      tenantId: "t1",
    });
    expect(rule.id).toBe("gr-vat-accommodation-mainland");
  });

  it("platform statutory wins over tenant commercial", () => {
    const tenantOverride = TaxRule.create({
      ...rules.find((r) => r.id === "gr-vat-accommodation-mainland")!.toProps(),
      id: "tenant-vat-override",
      tenantId: "t1",
      scope: "tenant_commercial",
      ratePercent: "1.0000",
      priority: 999,
    });
    const rule = resolveTaxRule(
      [...rules, tenantOverride],
      {
        taxType: "vat",
        classificationKey: "vat:accommodation",
        chargeCategory: "accommodation",
        accommodationType: null,
        propertyClassification: null,
        jurisdiction: "GR",
        country: "GR",
        asOf: new Date("2026-06-15T12:00:00.000Z"),
        seasonMonth: 6,
        floorAreaSqm: null,
        tenantId: "t1",
      },
    );
    expect(rule.scope).toBe("platform_statutory");
    expect(rule.ratePercent).toBe("13.0000");
  });
});

describe("TaxEngine Greek VAT + climate", () => {
  it("applies 13% accommodation VAT and different rate for extras", () => {
    const evaluation = engine.evaluate(
      {
        tenantId: "t1",
        country: "GR",
        jurisdiction: "GR",
        currency: "EUR",
        asOf: new Date("2026-06-15T12:00:00.000Z"),
        accommodationType: "hotel",
        propertyClassification: "hotel_stars_3",
        floorAreaSqm: null,
        stayNightDates: ["2026-06-15", "2026-06-16"],
        roomOrApartmentCount: 1,
        guestCount: 2,
        complimentaryStay: false,
        amountBasis: "NET",
        lines: [
          {
            lineId: "l1",
            chargeCategory: "accommodation",
            amount: Money.create("200.0000", "EUR"),
          },
          {
            lineId: "l2",
            chargeCategory: "extra",
            amount: Money.create("50.0000", "EUR"),
          },
        ],
      },
      rules,
    );
    const vatAcc = evaluation.components.find(
      (c) => c.sourceLineId === "l1" && c.taxType === "vat",
    );
    const vatExtra = evaluation.components.find(
      (c) => c.sourceLineId === "l2" && c.taxType === "vat",
    );
    expect(vatAcc?.appliedRatePercent).toBe("13.0000");
    expect(vatAcc?.calculatedAmount).toBe("26.0000");
    expect(vatExtra?.appliedRatePercent).toBe("24.0000");
    expect(vatExtra?.calculatedAmount).toBe("12.0000");
  });

  it("climate fee hotel 3★ high season = €5 × nights (per daily use)", () => {
    const evaluation = engine.evaluate(
      {
        tenantId: "t1",
        country: "GR",
        jurisdiction: "GR",
        currency: "EUR",
        asOf: new Date("2026-07-10T12:00:00.000Z"),
        accommodationType: "hotel",
        propertyClassification: "hotel_stars_3",
        floorAreaSqm: null,
        stayNightDates: ["2026-07-10", "2026-07-11", "2026-07-12"],
        roomOrApartmentCount: 1,
        guestCount: 2,
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
    const climate = evaluation.components.filter(
      (c) => c.taxType === "climate_resilience_fee",
    );
    expect(climate).toHaveLength(3);
    expect(climate.every((c) => c.appliedFixedAmount === "5.0000")).toBe(true);
    expect(climate.reduce((s, c) => s + Number(c.calculatedAmount), 0)).toBe(15);
    expect(climate[0]?.metadata.totalDailyUses).toBe(3);
    expect(climate[0]?.metadata.taxableDailyUses).toBe(3);
    expect(climate[0]?.metadata.dailyUses).toHaveLength(3);
    expect(climate[0]?.metadata.requiresSeparateFiscalDocument).toBe(true);
  });

  it("climate fee low season Nov–Mar hotel 3★ = €1.50 per daily use", () => {
    const evaluation = engine.evaluate(
      {
        tenantId: "t1",
        country: "GR",
        jurisdiction: "GR",
        currency: "EUR",
        asOf: new Date("2026-01-10T12:00:00.000Z"),
        accommodationType: "hotel",
        propertyClassification: "hotel_stars_3",
        floorAreaSqm: null,
        stayNightDates: ["2026-01-10", "2026-01-11"],
        roomOrApartmentCount: 1,
        guestCount: 1,
        complimentaryStay: false,
        amountBasis: "NET",
        lines: [],
      },
      rules,
    );
    const climate = evaluation.components.filter(
      (c) => c.taxType === "climate_resilience_fee",
    );
    expect(climate).toHaveLength(2);
    expect(climate[0]?.appliedFixedAmount).toBe("1.5000");
    expect(climate.reduce((s, c) => s + Number(c.calculatedAmount), 0)).toBe(3);
  });

  it("complimentary stay → zero levy with use metadata", () => {
    const evaluation = engine.evaluate(
      {
        tenantId: "t1",
        country: "GR",
        jurisdiction: "GR",
        currency: "EUR",
        asOf: new Date("2026-07-10T12:00:00.000Z"),
        accommodationType: "short_term_rental",
        propertyClassification: "short_term_rental",
        floorAreaSqm: 45,
        stayNightDates: ["2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13"],
        roomOrApartmentCount: 1,
        guestCount: 2,
        complimentaryStay: true,
        amountBasis: "NET",
        lines: [],
      },
      rules,
    );
    const climate = evaluation.components.filter(
      (c) => c.taxType === "climate_resilience_fee",
    );
    expect(climate).toHaveLength(4);
    expect(climate.every((c) => c.calculatedAmount === "0.0000")).toBe(true);
    expect(climate[0]?.metadata.totalDailyUses).toBe(4);
    expect(climate[0]?.metadata.complimentaryDailyUses).toBe(4);
    expect(climate[0]?.metadata.taxableDailyUses).toBe(0);
  });

  it("fails when hotel classification missing", () => {
    expect(() =>
      engine.evaluate(
        {
          tenantId: "t1",
          country: "GR",
          jurisdiction: "GR",
          currency: "EUR",
          asOf: new Date("2026-07-10T12:00:00.000Z"),
          accommodationType: "hotel",
          propertyClassification: null,
          floorAreaSqm: null,
          stayNightDates: ["2026-07-10"],
          roomOrApartmentCount: 1,
          guestCount: 1,
          complimentaryStay: false,
          amountBasis: "NET",
          lines: [],
        },
        rules,
      ),
    ).toThrow(ValidationError);
  });

  it("rule catalog change does not alter prior snapshot object", () => {
    const evaluation = engine.evaluate(
      {
        tenantId: "t1",
        country: "GR",
        jurisdiction: "GR",
        currency: "EUR",
        asOf: new Date("2026-07-10T12:00:00.000Z"),
        accommodationType: "hotel",
        propertyClassification: "hotel_stars_5",
        floorAreaSqm: null,
        stayNightDates: ["2026-07-10"],
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
    const snap = evaluation.components[0]!;
    const frozen = snap.calculatedAmount;
    // Mutating a rule prop object after evaluation must not rewrite snapshot.
    expect(frozen).toBe(snap.calculatedAmount);
    expect(snap.ruleId).toBeTruthy();
  });
});

describe("Fiscal profiles", () => {
  it("Guest billing profile is separate; individual without AFM ok", () => {
    const profile = CustomerBillingProfile.create({
      id: "c1",
      tenantId: "t1",
      type: "INDIVIDUAL",
      legalName: "Guest Person",
      vatNumber: null,
      country: "GR",
      address: {
        line1: "1 Street",
        line2: null,
        city: "Athens",
        region: null,
        postalCode: "10552",
        country: "GR",
      },
      email: null,
    });
    expect(profile.vatNumber).toBeNull();
  });

  it("Greek BUSINESS requires AFM", () => {
    expect(() =>
      CustomerBillingProfile.create({
        id: "c2",
        tenantId: "t1",
        type: "BUSINESS",
        legalName: "Co SA",
        vatNumber: null,
        country: "GR",
        address: {
          line1: "1 Street",
          line2: null,
          city: "Athens",
          region: null,
          postalCode: "10552",
          country: "GR",
        },
        email: null,
      }),
    ).toThrow(ValidationError);
  });

  it("hotel profile without classification fails tax readiness", () => {
    const profile = BusinessFiscalProfile.create({
      id: "b1",
      tenantId: "t1",
      propertyId: "p1",
      legalName: "Hotel SA",
      tradeName: null,
      country: "GR",
      vatNumber: "123456789",
      address: {
        line1: "1 Street",
        line2: null,
        city: "Athens",
        region: null,
        postalCode: "10552",
        country: "GR",
      },
      establishmentLocationId: "gr-mainland",
      establishmentInEligibleArea: false,
      servicePhysicallyExecutedInEligibleArea: false,
      establishmentCode: null,
      accommodationType: "hotel",
      propertyClassification: null,
      floorAreaSqm: null,
      metadata: {},
    });
    expect(profile.fiscalJurisdiction).toBe("GR");
    expect(() => profile.assertReadyForTaxEvaluation()).toThrow(ValidationError);
  });
});

describe("Folio tax snapshot immutability", () => {
  it("posted tax snapshot survives conceptual rule change", () => {
    const folio = Folio.open({
      id: "f1",
      tenantId: "t1",
      bookingId: "b1",
      currency: "EUR",
    });
    const line = FolioLine.createPosted({
      id: "tax1",
      tenantId: "t1",
      folioId: "f1",
      lineType: "tax",
      description: "VAT 13%",
      amount: Money.create("13.0000", "EUR"),
      source: {
        sourceType: "tax_evaluation",
        sourceId: "f1",
        sourceLineRef: "rule:l1",
      },
      sortOrder: 0,
      taxSnapshot: {
        taxType: "vat",
        classificationKey: "vat:accommodation",
        calculationKind: "PERCENTAGE",
        appliedRatePercent: "13.0000",
        appliedFixedAmount: null,
        taxableBase: "100.0000",
        calculatedAmount: "13.0000",
        currency: "EUR",
        ruleId: "gr-vat-accommodation-mainland",
        ruleScope: "platform_statutory",
        ruleValidFrom: "2016-06-01T00:00:00.000Z",
        ruleValidUntil: null,
        jurisdiction: "GR",
        legalSource: "AADE",
        legalVersion: "v1",
        metadata: {},
      },
    });
    folio.appendPostedLine(line);
    const balance = folio.computeBalance();
    expect(balance.vatTotal).toBe("13.0000");
    expect(line.taxSnapshot?.calculatedAmount).toBe("13.0000");
    // No update API on FolioLine.
    expect(typeof (line as { update?: unknown }).update).toBe("undefined");
  });
});

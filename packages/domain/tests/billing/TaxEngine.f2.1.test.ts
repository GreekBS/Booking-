import { describe, it, expect } from "vitest";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import { TaxEngine } from "../../src/billing/tax/TaxEngine";
import { greekStatutoryTaxRules } from "../../src/billing/tax/greekStatutoryTaxRules";
import { TaxRule } from "../../src/billing/tax/TaxRule";
import { ValidationError } from "../../src/shared/errors/DomainError";
import { Folio, FolioLine } from "../../src/billing/domain/Folio";

const engine = new TaxEngine();
const rules = greekStatutoryTaxRules();

function climateOnly(evaluation: ReturnType<TaxEngine["evaluate"]>) {
  return evaluation.components.filter((c) => c.taxType === "climate_resilience_fee");
}

function baseCtx(
  stayNightDates: string[],
  extras: Partial<Parameters<TaxEngine["evaluate"]>[0]> = {},
): Parameters<TaxEngine["evaluate"]>[0] {
  return {
    tenantId: "t1",
    country: "GR",
    jurisdiction: "GR",
    currency: "EUR",
    asOf: new Date(`${stayNightDates[0]}T12:00:00.000Z`),
    accommodationType: "hotel",
    propertyClassification: "hotel_stars_3",
    floorAreaSqm: null,
    stayNightDates,
    roomOrApartmentCount: 1,
    guestCount: 1,
    complimentaryStay: false,
    amountBasis: "NET",
    lines: [],
    ...extras,
  };
}

describe("F2.1 Climate Resilience Fee daily-use boundaries", () => {
  it("31 March → 1 April: single night uses low season", () => {
    const climate = climateOnly(
      engine.evaluate(baseCtx(["2026-03-31"]), rules),
    );
    expect(climate).toHaveLength(1);
    expect(climate[0]?.appliedFixedAmount).toBe("1.5000");
    expect(climate[0]?.metadata.dailyUses?.[0]?.seasonMonth).toBe(3);
  });

  it("multi-night stay crossing March/April splits seasons", () => {
    const climate = climateOnly(
      engine.evaluate(
        baseCtx(["2026-03-30", "2026-03-31", "2026-04-01"]),
        rules,
      ),
    );
    expect(climate).toHaveLength(3);
    expect(climate[0]?.calculatedAmount).toBe("1.5000"); // Mar 30 low
    expect(climate[1]?.calculatedAmount).toBe("1.5000"); // Mar 31 low
    expect(climate[2]?.calculatedAmount).toBe("5.0000"); // Apr 1 high
    expect(climate[0]?.metadata.totalDailyUses).toBe(3);
    expect(climate[0]?.metadata.dailyUses?.map((d) => d.seasonMonth)).toEqual([
      3, 3, 4,
    ]);
    const levy = climate.reduce((s, c) => s + Number(c.calculatedAmount), 0);
    expect(levy).toBe(8); // 1.5+1.5+5
  });

  it("31 October → 1 November: single night uses high season", () => {
    const climate = climateOnly(
      engine.evaluate(baseCtx(["2026-10-31"]), rules),
    );
    expect(climate).toHaveLength(1);
    expect(climate[0]?.appliedFixedAmount).toBe("5.0000");
    expect(climate[0]?.metadata.dailyUses?.[0]?.seasonMonth).toBe(10);
  });

  it("multi-night stay crossing October/November splits seasons", () => {
    const climate = climateOnly(
      engine.evaluate(
        baseCtx(["2026-10-30", "2026-10-31", "2026-11-01"]),
        rules,
      ),
    );
    expect(climate).toHaveLength(3);
    expect(climate[0]?.calculatedAmount).toBe("5.0000");
    expect(climate[1]?.calculatedAmount).toBe("5.0000");
    expect(climate[2]?.calculatedAmount).toBe("1.5000");
    expect(climate[0]?.metadata.dailyUses?.map((d) => d.seasonMonth)).toEqual([
      10, 10, 11,
    ]);
  });

  it("complimentary daily use crossing a seasonal boundary", () => {
    const climate = climateOnly(
      engine.evaluate(
        baseCtx(["2026-03-31", "2026-04-01"], {
          complimentaryNightDates: ["2026-03-31"],
        }),
        rules,
      ),
    );
    expect(climate).toHaveLength(2);
    expect(climate[0]?.calculatedAmount).toBe("0.0000"); // complimentary low
    expect(climate[1]?.calculatedAmount).toBe("5.0000"); // taxable high
    expect(climate[0]?.metadata.totalDailyUses).toBe(2);
    expect(climate[0]?.metadata.complimentaryDailyUses).toBe(1);
    expect(climate[0]?.metadata.taxableDailyUses).toBe(1);
    expect(climate[0]?.metadata.dailyUses?.[0]?.complimentary).toBe(true);
    expect(climate[0]?.metadata.dailyUses?.[1]?.complimentary).toBe(false);
  });

  it("TaxRule validFrom/validUntil boundary during a stay (per daily use)", () => {
    const now = new Date("2025-01-01T00:00:00.000Z");
    const mk = (id: string, amount: string, from: string, until: string | null) =>
      TaxRule.create({
        id,
        tenantId: null,
        scope: "platform_statutory",
        country: "GR",
        jurisdiction: "*",
        taxType: "climate_resilience_fee",
        classificationKey: "climate:hotel_stars_3",
        chargeCategory: "accommodation",
        accommodationType: "hotel",
        propertyClassification: "hotel_stars_3",
        calculationKind: "FIXED_PER_ROOM",
        ratePercent: null,
        fixedAmount: amount,
        currency: "EUR",
        basis: "QUANTITY",
        validFrom: new Date(`${from}T00:00:00.000Z`),
        validUntil: until ? new Date(`${until}T00:00:00.000Z`) : null,
        season: { months: [5, 6] },
        floorAreaMinSqm: null,
        floorAreaMaxExclusiveSqm: null,
        legalSource: "test",
        legalVersion: "test",
        priority: 100,
        createdAt: now,
        updatedAt: now,
      });

    const catalog = [
      mk("climate-v1", "5.0000", "2025-01-01", "2026-06-01"),
      mk("climate-v2", "7.0000", "2026-06-01", null),
    ];

    const climate = climateOnly(
      engine.evaluate(baseCtx(["2026-05-31", "2026-06-01"]), catalog),
    );
    expect(climate).toHaveLength(2);
    expect(climate[0]?.ruleId).toBe("climate-v1");
    expect(climate[0]?.calculatedAmount).toBe("5.0000");
    expect(climate[1]?.ruleId).toBe("climate-v2");
    expect(climate[1]?.calculatedAmount).toBe("7.0000");
    expect(climate[0]?.metadata.dailyUses?.[0]?.ruleId).toBe("climate-v1");
    expect(climate[0]?.metadata.dailyUses?.[1]?.ruleId).toBe("climate-v2");
  });

  it("historical posted climate snapshot remains immutable", () => {
    const folio = Folio.open({
      id: "f1",
      tenantId: "t1",
      bookingId: "b1",
      currency: "EUR",
    });
    const snap = {
      taxType: "climate_resilience_fee" as const,
      classificationKey: "climate:hotel_stars_3",
      calculationKind: "FIXED_PER_ROOM",
      appliedRatePercent: null,
      appliedFixedAmount: "1.5000",
      taxableBase: null,
      calculatedAmount: "1.5000",
      currency: "EUR",
      ruleId: "gr-climate-hotel_stars_3-low-2025",
      ruleScope: "platform_statutory",
      ruleValidFrom: "2025-01-01T00:00:00.000Z",
      ruleValidUntil: null,
      jurisdiction: "*",
      legalSource: "Law 5177/2025",
      legalVersion: "2025",
      metadata: {
        dailyUses: [
          {
            date: "2026-03-31",
            roomIndex: 0,
            complimentary: false,
            ruleId: "gr-climate-hotel_stars_3-low-2025",
            ruleValidFrom: "2025-01-01T00:00:00.000Z",
            ruleValidUntil: null,
            appliedFixedAmount: "1.5000",
            calculatedAmount: "1.5000",
            seasonMonth: 3,
          },
        ],
        totalDailyUses: 1,
        taxableDailyUses: 1,
        complimentaryDailyUses: 0,
      },
    };
    const line = FolioLine.createPosted({
      id: "levy1",
      tenantId: "t1",
      folioId: "f1",
      lineType: "levy",
      description: "Climate fee",
      amount: Money.create("1.5000", "EUR"),
      source: {
        sourceType: "tax_evaluation",
        sourceId: "f1",
        sourceLineRef: "climate:2026-03-31:r0",
      },
      sortOrder: 0,
      taxSnapshot: snap,
    });
    folio.appendPostedLine(line);
    expect(line.taxSnapshot?.calculatedAmount).toBe("1.5000");
    expect(line.taxSnapshot?.metadata.dailyUses?.[0]?.date).toBe("2026-03-31");
    expect(typeof (line as { update?: unknown }).update).toBe("undefined");
  });

  it("requires stayNightDates", () => {
    expect(() =>
      engine.evaluate(
        {
          ...baseCtx(["2026-07-01"]),
          stayNightDates: [],
        },
        rules,
      ),
    ).toThrow(ValidationError);
  });
});

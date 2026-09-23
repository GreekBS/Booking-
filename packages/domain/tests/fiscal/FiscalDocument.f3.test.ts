import { describe, it, expect } from "vitest";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import { ValidationError } from "../../src/shared/errors/DomainError";
import {
  FiscalDocument,
  FiscalDocumentLine,
  FiscalSeries,
  assertCreditWithinOriginal,
  computeFolioLineCoverage,
  assertCanAllocate,
  FiscalLineAllocation,
  greekFiscalDocumentMapper,
  minimalB2cCustomerSnapshot,
} from "../../src/fiscal";

const issuer = {
  businessFiscalProfileId: "biz-1",
  propertyId: "prop-1",
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
  establishmentCode: null,
  fiscalJurisdiction: "GR",
  accommodationType: "hotel",
  propertyClassification: "hotel_stars_3",
  floorAreaSqm: null,
  snappedAt: "2026-06-01T12:00:00.000Z",
};

const businessCustomer = {
  customerBillingProfileId: "cust-1",
  type: "BUSINESS" as const,
  legalName: "Corp SA",
  vatNumber: "987654321",
  country: "GR",
  address: {
    line1: "2 Ave",
    line2: null,
    city: "Athens",
    region: null,
    postalCode: "10553",
    country: "GR",
  },
  email: null,
  snappedAt: "2026-06-01T12:00:00.000Z",
};

function line(input: {
  id: string;
  docId: string;
  net: string;
  vat?: string;
  levy?: string;
  desc?: string;
  taxSnapshot?: {
    taxType: string;
    classificationKey: string;
    calculationKind: string;
    appliedRatePercent: string | null;
    appliedFixedAmount: string | null;
    taxableBase: string | null;
    calculatedAmount: string;
    currency: string;
    ruleId: string;
    ruleScope: string;
    ruleValidFrom: string;
    ruleValidUntil: string | null;
    jurisdiction: string;
    legalSource: string | null;
    legalVersion: string | null;
    metadata: Record<string, unknown>;
  } | null;
}) {
  const vat = input.vat ?? "0.0000";
  const levy = input.levy ?? "0.0000";
  const gross = Money.create(input.net, "EUR")
    .add(Money.create(vat, "EUR"))
    .add(Money.create(levy, "EUR")).amount;
  return FiscalDocumentLine.create({
    id: input.id,
    tenantId: "t1",
    fiscalDocumentId: input.docId,
    sortOrder: 0,
    description: input.desc ?? "Stay",
    quantity: "1.0000",
    unit: null,
    netAmount: input.net,
    vatAmount: vat,
    levyAmount: levy,
    grossAmount: gross,
    currency: "EUR",
    classificationKey: "accommodation",
    taxSnapshot: input.taxSnapshot ?? null,
    sourceFolioId: "folio-1",
    sourceFolioLineId: "fline-1",
    dailyUseProvenance: null,
    metadata: {},
  });
}

describe("F3 FiscalDocument aggregate", () => {
  it("creates draft and issues with immutable body thereafter", () => {
    const docId = "doc-1";
    const { document, lines } = FiscalDocument.createDraft({
      id: docId,
      tenantId: "t1",
      propertyId: "prop-1",
      documentKind: "SERVICE_RECEIPT",
      seriesId: "ser-1",
      seriesCode: "APY",
      currency: "EUR",
      issuerSnapshot: issuer,
      customerSnapshot: minimalB2cCustomerSnapshot({ legalName: "Guest" }),
      lines: [line({ id: "l1", docId, net: "100.0000", vat: "13.0000" })],
    });
    expect(document.status).toBe("DRAFT");
    document.markIssued({
      sequenceNumber: 1,
      issuanceIdempotencyKey: "idem-1",
      lines,
    });
    expect(document.status).toBe("ISSUED");
    expect(document.documentNumber()).toBe("APY-1");
    expect(document.pullDomainEvents()[0]?.eventType).toBe(
      "FiscalDocumentIssued",
    );
    expect(() => document.assertDraft()).toThrow(ValidationError);
  });

  it("freezes issuer and customer snapshots", () => {
    const { document } = FiscalDocument.createDraft({
      id: "doc-2",
      tenantId: "t1",
      propertyId: "prop-1",
      documentKind: "SERVICE_INVOICE",
      seriesId: "ser-1",
      seriesCode: "TIM",
      currency: "EUR",
      issuerSnapshot: issuer,
      customerSnapshot: businessCustomer,
      lines: [line({ id: "l1", docId: "doc-2", net: "50.0000", vat: "6.5000" })],
    });
    const snap = document.issuerSnapshot!;
    snap.legalName = "MUTATED";
    expect(document.issuerSnapshot?.legalName).toBe("Hotel SA");
  });

  it("rejects B2B invoice without AFM customer", () => {
    expect(() =>
      FiscalDocument.createDraft({
        id: "doc-3",
        tenantId: "t1",
        propertyId: "prop-1",
        documentKind: "SERVICE_INVOICE",
        seriesId: "ser-1",
        seriesCode: "TIM",
        currency: "EUR",
        issuerSnapshot: issuer,
        customerSnapshot: minimalB2cCustomerSnapshot({}),
        lines: [line({ id: "l1", docId: "doc-3", net: "10.0000" })],
      }),
    ).toThrow(ValidationError);
  });

  it("allows B2C minimal recipient without AFM", () => {
    const { document } = FiscalDocument.createDraft({
      id: "doc-4",
      tenantId: "t1",
      propertyId: "prop-1",
      documentKind: "SERVICE_RECEIPT",
      seriesId: "ser-1",
      seriesCode: "APY",
      currency: "EUR",
      issuerSnapshot: issuer,
      customerSnapshot: minimalB2cCustomerSnapshot({ legalName: "Walk-in" }),
      lines: [line({ id: "l1", docId: "doc-4", net: "10.0000", vat: "1.3000" })],
    });
    expect(document.customerSnapshot?.vatNumber).toBeNull();
  });

  it("rejects totals that do not reconcile", () => {
    expect(() =>
      FiscalDocumentLine.create({
        id: "bad",
        tenantId: "t1",
        fiscalDocumentId: "d",
        sortOrder: 0,
        description: "x",
        quantity: "1.0000",
        unit: null,
        netAmount: "10.0000",
        vatAmount: "1.0000",
        levyAmount: "0.0000",
        grossAmount: "99.0000",
        currency: "EUR",
        classificationKey: null,
        taxSnapshot: null,
        sourceFolioId: null,
        sourceFolioLineId: null,
        dailyUseProvenance: null,
        metadata: {},
      }),
    ).toThrow(ValidationError);
  });

  it("creates climate Special Element from historical taxSnapshot", () => {
    const taxSnapshot = {
      taxType: "climate_resilience_fee",
      classificationKey: "climate:hotel_stars_3",
      calculationKind: "FIXED_PER_ROOM",
      appliedRatePercent: null,
      appliedFixedAmount: "5.0000",
      taxableBase: null,
      calculatedAmount: "5.0000",
      currency: "EUR",
      ruleId: "gr-climate-hotel_stars_3-high-2025",
      ruleScope: "platform_statutory",
      ruleValidFrom: "2025-01-01T00:00:00.000Z",
      ruleValidUntil: null,
      jurisdiction: "*",
      legalSource: "Law 5177",
      legalVersion: "2025",
      metadata: {
        totalDailyUses: 1,
        taxableDailyUses: 1,
        complimentaryDailyUses: 0,
        dailyUses: [{ date: "2026-07-10", seasonMonth: 7 }],
      },
    };
    const { document, lines } = FiscalDocument.createDraft({
      id: "doc-clim",
      tenantId: "t1",
      propertyId: "prop-1",
      documentKind: "CLIMATE_RESILIENCE_FEE_RECEIPT",
      seriesId: "ser-c",
      seriesCode: "CRF",
      currency: "EUR",
      issuerSnapshot: issuer,
      customerSnapshot: minimalB2cCustomerSnapshot({}),
      lines: [
        line({
          id: "cl1",
          docId: "doc-clim",
          net: "0.0000",
          levy: "5.0000",
          desc: "Climate fee 2026-07-10",
          taxSnapshot,
        }),
      ],
    });
    expect(document.documentKind).toBe("CLIMATE_RESILIENCE_FEE_RECEIPT");
    expect(lines[0]?.levyAmount).toBe("5.0000");
    expect(document.totals.grossTotal).toBe("5.0000");
  });

  it("enforces credit within original capacity", () => {
    assertCreditWithinOriginal("100.0000", "EUR", "40.0000", "60.0000");
    expect(() =>
      assertCreditWithinOriginal("100.0000", "EUR", "40.0000", "61.0000"),
    ).toThrow(ValidationError);
  });
});

describe("F3 FiscalSeries", () => {
  it("creates series with nextSequence starting at 1", () => {
    const s = FiscalSeries.create({
      id: "s1",
      tenantId: "t1",
      propertyId: "p1",
      documentKind: "SERVICE_RECEIPT",
      seriesCode: "apy-01",
      active: true,
      label: "APY",
      metadata: {},
    });
    expect(s.seriesCode).toBe("APY-01");
    expect(s.nextSequence).toBe(1);
  });
});

describe("F3 fiscal coverage", () => {
  it("tracks unfiscalized / partial / full and rejects over-allocation", () => {
    const a1 = FiscalLineAllocation.create({
      id: "a1",
      tenantId: "t1",
      folioId: "f1",
      folioLineId: "fl1",
      fiscalDocumentId: "d1",
      fiscalDocumentLineId: "dl1",
      allocatedAmount: "40.0000",
      currency: "EUR",
      createdAt: new Date(),
    });
    expect(computeFolioLineCoverage("fl1", "100.0000", "EUR", []).status).toBe(
      "unfiscalized",
    );
    expect(
      computeFolioLineCoverage("fl1", "100.0000", "EUR", [a1]).status,
    ).toBe("partially_fiscalized");
    const a2 = FiscalLineAllocation.create({
      id: "a2",
      tenantId: "t1",
      folioId: "f1",
      folioLineId: "fl1",
      fiscalDocumentId: "d2",
      fiscalDocumentLineId: "dl2",
      allocatedAmount: "60.0000",
      currency: "EUR",
      createdAt: new Date(),
    });
    expect(
      computeFolioLineCoverage("fl1", "100.0000", "EUR", [a1, a2]).status,
    ).toBe("fully_fiscalized");
    expect(() =>
      assertCanAllocate("100.0000", "EUR", "90.0000", "20.0000"),
    ).toThrow(ValidationError);
  });
});

describe("F3 GreekFiscalDocumentMapper", () => {
  const mapper = greekFiscalDocumentMapper;
  it("maps verified myDATA v2.0.2 types", () => {
    expect(mapper.map("SERVICE_INVOICE").myDataInvoiceType).toBe("2.1");
    expect(mapper.map("SERVICE_RECEIPT").myDataInvoiceType).toBe("11.2");
    expect(mapper.map("RETAIL_CREDIT").myDataInvoiceType).toBe("11.4");
    expect(mapper.map("SERVICE_CREDIT").myDataInvoiceType).toBe("5.1");
    expect(mapper.map("CLIMATE_RESILIENCE_FEE_RECEIPT").myDataInvoiceType).toBe(
      "8.2",
    );
  });
});

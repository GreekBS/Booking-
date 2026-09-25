import { describe, expect, it } from "vitest";
import {
  CustomerBillingProfile,
} from "../../src/fiscal/domain/FiscalProfiles";
import {
  FiscalDocument,
} from "../../src/fiscal/documents/FiscalDocument";
import { FiscalDocumentLine } from "../../src/fiscal/documents/FiscalDocumentLine";
import type { FiscalIssuerSnapshot, FiscalCustomerSnapshot } from "../../src/fiscal/documents/FiscalPartySnapshots";

const address = {
  line1: "1 Street",
  line2: null as string | null,
  city: "Athens",
  region: null as string | null,
  postalCode: "10431",
  country: "GR",
};

const issuer: FiscalIssuerSnapshot = {
  businessFiscalProfileId: "biz-1",
  propertyId: "prop-1",
  legalName: "Hotel SA",
  tradeName: null,
  country: "GR",
  vatNumber: "123456789",
  address,
  establishmentLocationId: "gr-mainland",
  establishmentCode: null,
  fiscalJurisdiction: "GR",
  accommodationType: "short_term_rental",
  propertyClassification: null,
  floorAreaSqm: null,
  snappedAt: new Date().toISOString(),
};

describe("Customer billing profile + issued snapshot immutability", () => {
  it("supports individual and business profiles", () => {
    const individual = CustomerBillingProfile.create({
      id: "c1",
      tenantId: "t1",
      type: "INDIVIDUAL",
      legalName: "Maria Papadopoulos",
      vatNumber: null,
      country: "GR",
      address,
      email: "maria@example.com",
    });
    expect(individual.type).toBe("INDIVIDUAL");
    expect(individual.vatNumber).toBeNull();

    const business = CustomerBillingProfile.create({
      id: "c2",
      tenantId: "t1",
      type: "BUSINESS",
      legalName: "Acme OE",
      vatNumber: "987654321",
      country: "GR",
      address,
      email: null,
    });
    expect(business.type).toBe("BUSINESS");
    expect(business.vatNumber).toBe("987654321");
  });

  it("profile update does not mutate issued document customer snapshot", () => {
    const profile = CustomerBillingProfile.create({
      id: "c3",
      tenantId: "t1",
      type: "BUSINESS",
      legalName: "Acme OE",
      vatNumber: "987654321",
      country: "GR",
      address,
      email: null,
    });

    const customerSnapshot: FiscalCustomerSnapshot = {
      customerBillingProfileId: profile.id,
      type: profile.type,
      legalName: profile.legalName,
      vatNumber: profile.vatNumber,
      country: profile.country,
      address: profile.address,
      email: profile.email,
      snappedAt: new Date().toISOString(),
    };

    const line = FiscalDocumentLine.create({
      id: "l1",
      tenantId: "t1",
      fiscalDocumentId: "doc-1",
      sortOrder: 0,
      description: "Stay",
      quantity: "1.0000",
      unit: null,
      netAmount: "100.0000",
      vatAmount: "24.0000",
      levyAmount: "0.0000",
      grossAmount: "124.0000",
      currency: "EUR",
      classificationKey: null,
      taxSnapshot: null,
      sourceFolioId: null,
      sourceFolioLineId: null,
    });

    const { document } = FiscalDocument.createDraft({
      id: "doc-1",
      tenantId: "t1",
      propertyId: "prop-1",
      documentKind: "SERVICE_INVOICE",
      seriesId: "ser-1",
      seriesCode: "A",
      currency: "EUR",
      issuerSnapshot: issuer,
      customerSnapshot,
      lines: [line],
    });
    document.markIssued({
      sequenceNumber: 1,
      issuanceIdempotencyKey: "k1",
      lines: [line],
    });

    profile.update({ legalName: "Acme Renamed SA", vatNumber: "111111111" });
    expect(profile.legalName).toBe("Acme Renamed SA");
    expect(document.customerSnapshot?.legalName).toBe("Acme OE");
    expect(document.customerSnapshot?.vatNumber).toBe("987654321");
  });
});

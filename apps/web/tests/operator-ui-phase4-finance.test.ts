import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectionSourceLabel,
  fiscalDocumentKindLabel,
  formatOperatorMoney,
  paymentMethodLabel,
  paymentStatusLabel,
} from "@/lib/admin/money-presentation";
const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Talos operator Phase 4 — Pricing / Payments / Fiscal", () => {
  it("Pricing uses Active Property, unit selector without property picker, Surface hierarchy", () => {
    const page = read("features/pricing/PricingPage.tsx");
    expect(page).toContain("useActiveProperty");
    expect(page).toContain("renderActivePropertyGate");
    expect(page).toContain("PageHeader");
    expect(page).toContain("Surface");
    expect(page).toContain("SurfaceHeader");
    expect(page).toContain('aria-label="Επιλογή μονάδας"');
    expect(page).toContain("Βασική τιμή");
    expect(page).toContain("elCommon.guests");
    expect(page).not.toContain("onSelectedPropertyChange");
    expect(page).not.toContain("Select property");
    expect(page).not.toContain("{u.propertyName} — {u.name}");
  });

  it("Pricing quote preview is read-only and does not create Hold", () => {
    const page = read("features/pricing/PricingPage.tsx");
    expect(page).toContain("previewQuoteForStay");
    expect(page).toContain("Εκτίμηση μόνο για ανάγνωση");
    expect(page).toContain("Δεν δημιουργεί δέσμευση");
    expect(page).toContain("Προεπισκόπηση τιμής");
    expect(page).not.toContain("Preview (creates Hold)");
    expect(page).not.toContain("Creates a temporary Hold");
    expect(page).not.toContain("inventory-mutating preview");

    const api = read("lib/admin/api.ts");
    expect(api).toMatch(/previewQuoteForStay[\s\S]*?\/pricing\/preview/);
    expect(api).not.toMatch(/previewQuoteForStay[\s\S]*?\/holds/);
  });

  it("Pricing still loads rate plan per unit (no batch rewrite)", () => {
    const page = read("features/pricing/PricingPage.tsx");
    expect(page).toContain("`/units/${unitId}/rate-plan`");
    expect(page).toContain("fetchPropertyUnitCatalog");
  });

  it("Payments uses PageHeader, Surface, Table, StatusBadge, Active Property", () => {
    const page = read("features/payments/PaymentsPage.tsx");
    expect(page).toContain("PageHeader");
    expect(page).toContain("Surface");
    expect(page).toContain("StatusBadge");
    expect(page).toContain("useActiveProperty");
    expect(page).toContain("renderActivePropertyGate");
    expect(page).toContain("`/payments?propertyId=");
    expect(page).toContain("externalReference");
    expect(page).toContain("bookingId");
    expect(page).toContain("idempotencyKey");
    expect(page).toContain("CASH");
    expect(page).toContain("COLLECTION" !== "x" && "collectionSource");
    expect(page).not.toContain('className="space-y-6 p-6"');
    expect(page).not.toContain("<h1");
  });

  it("Payments summary uses SUCCEEDED list amounts only (not booking totals)", () => {
    const page = read("features/payments/PaymentsPage.tsx");
    expect(page).toContain('p.status === "SUCCEEDED"');
    expect(page).not.toContain("folioTotal");
    expect(page).not.toContain("outstandingBalance");
  });

  it("Fiscal list uses shared ledger chrome and separates levy from VAT", () => {
    const page = read("features/fiscal/FiscalDocumentsPage.tsx");
    expect(page).toContain("PageHeader");
    expect(page).toContain("Surface");
    expect(page).toContain("StatusBadge");
    expect(page).toContain("useActiveProperty");
    expect(page).toContain("levyTotal");
    expect(page).toContain("/download");
    expect(page).toContain("ISSUED");
    expect(page).toContain("DRAFT");
    expect(page).not.toContain("Submitted to AADE");
    expect(page).not.toContain("MARK received");
    expect(page).not.toContain('className="space-y-6 p-6"');
  });

  it("Fiscal detail preserves immutability, PDF path, and levy ≠ VAT", () => {
    const detail = read("features/fiscal/FiscalDocumentDetailPage.tsx");
    expect(detail).toContain("PageHeader");
    expect(detail).toContain("Στιγμιότυπο εκδότη");
    expect(detail).toContain("Στιγμιότυπο πελάτη");
    expect(detail).toContain("αμετάβλητα");
    expect(detail).toContain("levyTotal");
    expect(detail).toContain("Τέλος κλιματικής ανθεκτικότητας");
    expect(detail).toContain("(όχι ΦΠΑ)");
    expect(detail).toContain("/download");
    expect(detail).toContain("Τοπική έκδοση");
    expect(detail).toContain("elCommon.back");
    expect(detail).not.toContain("editIssuer");
    expect(detail).not.toContain("setVatTotal");
    expect(detail).not.toContain("AADE transmission");
  });

  it("money presentation helpers format without inventing fiscalization labels", () => {
    expect(formatOperatorMoney("120.5000", "EUR")).toMatch(/120/);
    expect(paymentMethodLabel("BANK_TRANSFER")).toBe("Τραπεζική μεταφορά");
    expect(collectionSourceLabel("PAYMENT_GATEWAY")).toBe("Πύλη πληρωμών");
    expect(paymentStatusLabel("SUCCEEDED")).toBe("Επιτυχής");
    expect(fiscalDocumentKindLabel("CLIMATE_RESILIENCE_FEE_RECEIPT")).toContain(
      "κλιματικής ανθεκτικότητας",
    );
  });
});

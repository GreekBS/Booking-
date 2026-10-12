import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { resolveFrozenImportCommitPrice } from "../../src/commerce/import/ReservationImportCommitPricing";
import { evaluateReservationImportCommitEligibility } from "../../src/commerce/import/ReservationImportCommitEligibility";
import {
  CSV_IMPORT_DEFAULT_CURRENCY,
  parseCsvImportPrice,
} from "../../src/commerce/import/csv/parsePrice";
import { parseAndValidateCsvImport } from "../../src/commerce/import/csv/parseAndValidate";
import { Quote } from "../../src/commerce/booking/domain/Quote";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import {
  computeReservationImportDraftExpiresAt,
  type ReservationImportBatchRecord,
  type ReservationImportRowRecord,
} from "../../src/commerce/import/ReservationImportTypes";
import { createHoldForUnit, HOLD_CREATED_AT } from "./fixtures/commerceFixtures";
import { normalizeOperatorEnteredImportPrice } from "../../src/commerce/import/ReservationImportOperatorPrice";

const now = new Date("2026-10-03T10:00:00.000Z");

function makeBatch(): ReservationImportBatchRecord {
  return {
    id: randomUUID(),
    tenantId: "tenant-a",
    propertyId: "prop-a",
    actorId: "actor-a",
    sourceNamespace: "csv_reservation_import",
    filename: "t.csv",
    byteSize: 10,
    rowCount: 1,
    status: "draft",
    missingPriceStrategy: "undecided",
    expiresAt: computeReservationImportDraftExpiresAt(now),
    committedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeRow(
  batchId: string,
  overrides: Partial<ReservationImportRowRecord> = {},
): ReservationImportRowRecord {
  return {
    id: overrides.id ?? randomUUID(),
    tenantId: "tenant-a",
    batchId,
    rowNumber: overrides.rowNumber ?? 1,
    sourceNamespace: "csv_reservation_import",
    externalReference: overrides.externalReference ?? "EXT-1",
    unitId: overrides.unitId ?? "unit-a",
    checkIn: overrides.checkIn ?? "2026-12-01",
    checkOut: overrides.checkOut ?? "2026-12-03",
    temporalClass: overrides.temporalClass ?? "future",
    guestName: "Guest",
    guestEmail: "g@test.com",
    guestPhone: null,
    guestCount: 2,
    priceSource: overrides.priceSource ?? "imported_csv",
    importedTotalAmount: overrides.importedTotalAmount ?? "100.0000",
    importedCurrency: overrides.importedCurrency ?? null,
    operatorTotalAmount: overrides.operatorTotalAmount ?? null,
    operatorCurrency: overrides.operatorCurrency ?? null,
    conflictResolution: overrides.conflictResolution ?? "undecided",
    replaceBookingId: overrides.replaceBookingId ?? null,
    replaceBookingIds: overrides.replaceBookingIds ?? [],
    conflictSnapshot: overrides.conflictSnapshot ?? {
      version: 1,
      overlaps: [],
      peerImportRowIds: [],
      existingBookingIds: [],
      nonBookingBlockers: [],
    },
    conflictGroupId: null,
    recheckRequired: false,
    status: overrides.status ?? "ready",
    createdBookingId: null,
    supersededBookingId: null,
    errorCode: null,
    errorMessage: null,
    payload: {},
    processedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("CSV import EUR default currency policy", () => {
  it("1) missing CSV currency resolves to EUR", () => {
    const price = parseCsvImportPrice("150.00", null);
    expect(price.status).toBe("present");
    if (price.status !== "present") return;
    expect(price.currency).toBe(CSV_IMPORT_DEFAULT_CURRENCY);
    expect(price.currencyDefaulted).toBe(true);
    expect(price.amount).toBe("150.0000");
  });

  it("2) empty currency cell resolves to EUR", () => {
    const price = parseCsvImportPrice("957.30", "   ");
    expect(price.status).toBe("present");
    if (price.status !== "present") return;
    expect(price.currency).toBe("EUR");
    expect(price.currencyDefaulted).toBe(true);
  });

  it("3) explicit EUR is preserved", () => {
    const price = parseCsvImportPrice("100", "eur");
    expect(price.status).toBe("present");
    if (price.status !== "present") return;
    expect(price.currency).toBe("EUR");
    expect(price.currencyDefaulted).toBe(false);
  });

  it("4) explicit non-EUR currency is preserved", () => {
    const price = parseCsvImportPrice("100", "USD");
    expect(price.status).toBe("present");
    if (price.status !== "present") return;
    expect(price.currency).toBe("USD");
    expect(price.currencyDefaulted).toBe(false);
  });

  it("5) invalid explicit currency is rejected", () => {
    const price = parseCsvImportPrice("100", "EURO");
    expect(price.status).toBe("invalid");
    if (price.status !== "invalid") return;
    expect(price.reason).toMatch(/Invalid currency/i);
  });

  it("6) operator currency override works", () => {
    const normalized = normalizeOperatorEnteredImportPrice({
      amount: "200",
      currency: "GBP",
    });
    expect(normalized.currency).toBe("GBP");
    expect(normalized.amount).toBe("200.0000");
  });

  it("7) property defaultCurrency can extend the fallback", () => {
    const price = parseCsvImportPrice("50", null, { defaultCurrency: "CHF" });
    expect(price.status).toBe("present");
    if (price.status !== "present") return;
    expect(price.currency).toBe("CHF");
    expect(price.currencyDefaulted).toBe(true);
  });

  it("8) readiness and commit resolve missing currency identically to EUR", () => {
    const batch = makeBatch();
    // Legacy draft compatibility: null stored currency
    const rows = [
      makeRow(batch.id, { importedCurrency: null, status: "ready" }),
    ];
    const elig = evaluateReservationImportCommitEligibility({ batch, rows, now });
    expect(elig.isSuccess).toBe(true);
    const frozen = resolveFrozenImportCommitPrice(rows[0]!);
    expect(frozen.currency).toBe("EUR");
    expect(frozen.currencyDefaulted).toBe(true);
    expect(frozen.amount).toBe("100.0000");
  });

  it("9) existing draft with null currency freezes to EUR (compat)", () => {
    const frozen = resolveFrozenImportCommitPrice(
      makeRow(randomUUID(), {
        importedCurrency: null,
        importedTotalAmount: "500.00",
      }),
    );
    expect(frozen.currency).toBe("EUR");
    expect(frozen.amount).toBe("500.0000");
  });

  it("10) Quote.createFromFixedTotal persists EUR (non-null)", () => {
    const hold = createHoldForUnit(
      "unit-a",
      "prop-a",
      "2026-12-01",
      "2026-12-03",
    );
    const quote = Quote.createFromFixedTotal({
      id: randomUUID(),
      snapshotId: randomUUID(),
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("250.00", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: HOLD_CREATED_AT,
    });
    expect(quote.snapshot.currency).toBe("EUR");
    expect(quote.snapshot.totalAmount).toBe("250.0000");
    expect(quote.snapshot.pricingMode).toBe("imported_csv");
  });

  it("11) NET INCOME column maps to amount with EUR default; amount preserved exactly", () => {
    const csv = [
      "Confirmation code,Check-in,Check-out,Guest,NET INCOME",
      "G-1,2026-12-01,2026-12-03,Ada,150.00",
    ].join("\n");
    const result = parseAndValidateCsvImport({
      content: csv,
      dateFormat: "iso",
      columnMapping: {
        "Confirmation code": "externalReference",
        "Check-in": "checkIn",
        "Check-out": "checkOut",
        Guest: "guestName",
        "NET INCOME": "totalAmount",
      },
    });
    const row = result.rows[0]!;
    expect(row.price.status).toBe("present");
    if (row.price.status !== "present") return;
    expect(row.price.amount).toBe("150.0000");
    expect(row.price.currency).toBe("EUR");
    expect(row.price.currencyDefaulted).toBe(true);
  });
});

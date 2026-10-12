import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  evaluateReservationImportCommitEligibility,
  setsEqual,
} from "../../src/commerce/import/ReservationImportCommitEligibility";
import { resolveFrozenImportCommitPrice } from "../../src/commerce/import/ReservationImportCommitPricing";
import {
  assertKeepCsvReplaceTargetsValid,
  evaluateKeepCsvReplaceTargets,
  scanImportCalendarConflicts,
} from "../../src/commerce/import/ReservationImportCommitRevalidation";
import {
  computeReservationImportDraftExpiresAt,
  type ReservationImportBatchRecord,
  type ReservationImportRowRecord,
} from "../../src/commerce/import/ReservationImportTypes";
import { Quote } from "../../src/commerce/booking/domain/Quote";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import { Booking } from "../../src/commerce/booking/domain/Booking";
import { ConflictError } from "../../src/shared/errors/DomainError";
import {
  createHoldForUnit,
  villaProperty,
  HOLD_CREATED_AT,
  TENANT_ID,
} from "./fixtures/commerceFixtures";

const now = new Date("2026-10-03T10:00:00.000Z");

function makeBatch(
  overrides: Partial<ReservationImportBatchRecord> = {},
): ReservationImportBatchRecord {
  const createdAt = overrides.createdAt ?? now;
  return {
    id: overrides.id ?? randomUUID(),
    tenantId: overrides.tenantId ?? "tenant-a",
    propertyId: overrides.propertyId ?? "prop-a",
    actorId: "actor-a",
    sourceNamespace: "csv_reservation_import",
    filename: "t.csv",
    byteSize: 10,
    rowCount: overrides.rowCount ?? 1,
    status: overrides.status ?? "draft",
    missingPriceStrategy: "undecided",
    expiresAt: overrides.expiresAt ?? computeReservationImportDraftExpiresAt(createdAt),
    committedAt: overrides.committedAt ?? null,
    createdAt,
    updatedAt: createdAt,
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
    importedCurrency: overrides.importedCurrency ?? "EUR",
    operatorTotalAmount: overrides.operatorTotalAmount ?? null,
    operatorCurrency: overrides.operatorCurrency ?? null,
    conflictResolution: overrides.conflictResolution ?? "undecided",
    replaceBookingId: overrides.replaceBookingId ?? null,
    replaceBookingIds: overrides.replaceBookingIds ?? [],
    conflictSnapshot: overrides.conflictSnapshot ?? {
      version: 1,
      existingBookingIds: [],
      peerImportRowIds: [],
      nonBookingBlockers: [],
      overlaps: [],
    },
    conflictGroupId: null,
    recheckRequired: overrides.recheckRequired ?? false,
    status: overrides.status ?? "ready",
    createdBookingId: null,
    supersededBookingId: null,
    errorCode: overrides.errorCode ?? null,
    errorMessage: overrides.errorMessage ?? null,
    payload: {},
    processedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function completedBooking(id: string, unitId = villaProperty.units[0].id): Booking {
  const hold = createHoldForUnit(
    unitId,
    villaProperty.id,
    "2025-08-01",
    "2025-08-04",
  );
  const quote = Quote.createFromFixedTotal({
    id: `q-${id}`,
    snapshotId: `s-${id}`,
    hold,
    propertyTimezone: "Europe/Athens",
    total: Money.create("100.00", "EUR"),
    pricingMode: "imported_csv",
    quotedAt: new Date(HOLD_CREATED_AT.getTime() + 5_000),
  });
  const booking = Booking.create({
    id,
    hold,
    quote,
    guest: { name: "G", email: "g@t.com", phone: null },
    confirmationMode: "manual",
    now: new Date(HOLD_CREATED_AT.getTime() + 5_000),
  });
  booking.confirm(new Date(HOLD_CREATED_AT.getTime() + 6_000));
  booking.complete(new Date(HOLD_CREATED_AT.getTime() + 7_000));
  booking.pullDomainEvents();
  return booking;
}

describe("ReservationImportCommitEligibility", () => {
  it("accepts ready rows and keep_existing skips", () => {
    const batch = makeBatch();
    const rows = [
      makeRow(batch.id, { status: "ready", rowNumber: 1 }),
      makeRow(batch.id, {
        status: "skipped",
        errorCode: "KEEP_EXISTING",
        conflictResolution: "keep_existing",
        rowNumber: 2,
        externalReference: "EXT-2",
      }),
    ];
    const result = evaluateReservationImportCommitEligibility({ batch, rows, now });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().importCount).toBe(1);
    expect(result.getValue().skipCount).toBe(1);
  });

  it("blocks pending and failed rows", () => {
    const batch = makeBatch();
    expect(
      evaluateReservationImportCommitEligibility({
        batch,
        rows: [makeRow(batch.id, { status: "pending" })],
        now,
      }).isFailure,
    ).toBe(true);
    expect(
      evaluateReservationImportCommitEligibility({
        batch,
        rows: [makeRow(batch.id, { status: "failed", errorCode: "BLOCKED_BY_OWNER" })],
        now,
      }).isFailure,
    ).toBe(true);
  });

  it("blocks unresolved price on ready rows", () => {
    const batch = makeBatch();
    const result = evaluateReservationImportCommitEligibility({
      batch,
      rows: [makeRow(batch.id, { status: "ready", priceSource: "unresolved" })],
      now,
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/unresolved price/i);
  });

  it("blocks duplicate externalReference among import candidates", () => {
    const batch = makeBatch();
    const result = evaluateReservationImportCommitEligibility({
      batch,
      rows: [
        makeRow(batch.id, { status: "ready", externalReference: "DUP", rowNumber: 1 }),
        makeRow(batch.id, { status: "ready", externalReference: "dup", rowNumber: 2 }),
      ],
      now,
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/duplicate externalReference/i);
  });

  it("blocks overlapping keep_csv exclusivity", () => {
    const batch = makeBatch();
    const result = evaluateReservationImportCommitEligibility({
      batch,
      rows: [
        makeRow(batch.id, {
          status: "ready",
          conflictResolution: "keep_csv",
          checkIn: "2026-12-01",
          checkOut: "2026-12-05",
          externalReference: "A",
          rowNumber: 1,
        }),
        makeRow(batch.id, {
          status: "ready",
          conflictResolution: "keep_csv",
          checkIn: "2026-12-03",
          checkOut: "2026-12-07",
          externalReference: "B",
          rowNumber: 2,
        }),
      ],
      now,
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/overlapping keep_csv/i);
  });

  it("rejects expired and completed batches for eligibility (completed handled separately)", () => {
    const createdAt = new Date("2026-09-01T00:00:00.000Z");
    const expired = makeBatch({
      createdAt,
      expiresAt: computeReservationImportDraftExpiresAt(createdAt),
    });
    expect(
      evaluateReservationImportCommitEligibility({
        batch: expired,
        rows: [makeRow(expired.id)],
        now: new Date("2026-10-05T00:00:00.000Z"),
      }).isFailure,
    ).toBe(true);

    const completed = makeBatch({ status: "completed", committedAt: now });
    expect(
      evaluateReservationImportCommitEligibility({
        batch: completed,
        rows: [makeRow(completed.id)],
        now,
      }).isFailure,
    ).toBe(true);
  });

  it("setsEqual is order-independent", () => {
    expect(setsEqual(["a", "b"], ["b", "a"])).toBe(true);
    expect(setsEqual(["a"], ["a", "b"])).toBe(false);
  });
});

describe("resolveFrozenImportCommitPrice", () => {
  it("resolves imported_csv / operator_entered / talos_calculated without repricing", () => {
    const batchId = randomUUID();
    expect(
      resolveFrozenImportCommitPrice(
        makeRow(batchId, {
          priceSource: "imported_csv",
          importedTotalAmount: "250.50",
          importedCurrency: "EUR",
        }),
      ),
    ).toEqual({
      amount: "250.5000",
      currency: "EUR",
      pricingMode: "imported_csv",
    });

    expect(
      resolveFrozenImportCommitPrice(
        makeRow(batchId, {
          priceSource: "operator_entered",
          operatorTotalAmount: "90",
          operatorCurrency: "EUR",
        }),
      ).pricingMode,
    ).toBe("operator_entered");

    expect(
      resolveFrozenImportCommitPrice(
        makeRow(batchId, {
          priceSource: "talos_calculated",
          operatorTotalAmount: "150.0000",
          operatorCurrency: "EUR",
        }),
      ),
    ).toEqual({
      amount: "150.0000",
      currency: "EUR",
      pricingMode: "talos_calculated",
    });
  });

  it("rejects missing frozen talos amounts", () => {
    expect(() =>
      resolveFrozenImportCommitPrice(
        makeRow(randomUUID(), {
          priceSource: "talos_calculated",
          operatorTotalAmount: null,
          operatorCurrency: null,
        }),
      ),
    ).toThrow(/missing frozen/i);
  });
});

describe("Quote.createFromFixedTotal talos_calculated provenance", () => {
  it("preserves frozen TALOS total with talos_calculated pricingMode", () => {
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2026-11-10",
      "2026-11-15",
    );
    const quote = Quote.createFromFixedTotal({
      id: "q-talos",
      snapshotId: "s-talos",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("777.00", "EUR"),
      pricingMode: "talos_calculated",
      quotedAt: new Date(HOLD_CREATED_AT.getTime() + 5_000),
    });
    expect(quote.snapshot.pricingMode).toBe("talos_calculated");
    expect(quote.snapshot.totalAmount).toBe("777.0000");
  });
});

describe("keep_csv replace target fail-closed", () => {
  it("accepts confirmed replacement targets", () => {
    const batchId = randomUUID();
    const row = makeRow(batchId, {
      status: "ready",
      conflictResolution: "keep_csv",
      replaceBookingIds: ["b1"],
      unitId: villaProperty.units[0].id,
    });
    (row as { tenantId: string }).tenantId = TENANT_ID;
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    const quote = Quote.createFromFixedTotal({
      id: "q1",
      snapshotId: "s1",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("10.00", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: new Date(HOLD_CREATED_AT.getTime() + 5_000),
    });
    const confirmed = Booking.create({
      id: "b1",
      hold,
      quote,
      guest: { name: "G", email: "g@t.com", phone: null },
      confirmationMode: "manual",
      now: new Date(HOLD_CREATED_AT.getTime() + 5_000),
    });
    confirmed.confirm(new Date(HOLD_CREATED_AT.getTime() + 6_000));
    confirmed.pullDomainEvents();

    expect(() =>
      assertKeepCsvReplaceTargetsValid({
        row,
        liveExistingBookingIds: ["b1"],
        targets: [confirmed],
      }),
    ).not.toThrow();
  });

  it("rejects pending replacement targets", () => {
    const batchId = randomUUID();
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    const quote = Quote.createFromFixedTotal({
      id: "q-pend",
      snapshotId: "s-pend",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("10.00", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: new Date(HOLD_CREATED_AT.getTime() + 5_000),
    });
    const pending = Booking.create({
      id: "b-pend",
      hold,
      quote,
      guest: { name: "G", email: "g@t.com", phone: null },
      confirmationMode: "manual",
      now: new Date(HOLD_CREATED_AT.getTime() + 5_000),
    });
    pending.pullDomainEvents();
    const row = makeRow(batchId, {
      conflictResolution: "keep_csv",
      replaceBookingIds: ["b-pend"],
      unitId: villaProperty.units[0].id,
    });
    (row as { tenantId: string }).tenantId = TENANT_ID;
    expect(() =>
      assertKeepCsvReplaceTargetsValid({
        row,
        liveExistingBookingIds: ["b-pend"],
        targets: [pending],
      }),
    ).toThrow(ConflictError);
  });

  it("accepts completed targets with set-equal replaceBookingIds", () => {
    const batchId = randomUUID();
    const a = completedBooking("a1");
    const b = completedBooking("b1");
    const row = makeRow(batchId, {
      status: "ready",
      conflictResolution: "keep_csv",
      replaceBookingIds: ["b1", "a1"],
      unitId: villaProperty.units[0].id,
      // Booking fixtures use TENANT_ID
      ...({} as object),
    });
    // Override tenant to match fixture bookings
    (row as { tenantId: string }).tenantId = TENANT_ID;
    expect(() =>
      assertKeepCsvReplaceTargetsValid({
        row,
        liveExistingBookingIds: ["a1", "b1"],
        targets: [a, b],
      }),
    ).not.toThrow();
  });

  it("rejects stale replaceBookingIds", () => {
    const batchId = randomUUID();
    const a = completedBooking("a1");
    const row = makeRow(batchId, {
      conflictResolution: "keep_csv",
      replaceBookingIds: ["a1"],
      unitId: villaProperty.units[0].id,
    });
    (row as { tenantId: string }).tenantId = TENANT_ID;
    expect(() =>
      assertKeepCsvReplaceTargetsValid({
        row,
        liveExistingBookingIds: ["a1", "extra"],
        targets: [a],
      }),
    ).toThrow(/stale/i);
  });

  it("accepts four completed and four confirmed replacement targets", () => {
    const batchId = randomUUID();
    const completed = ["a1", "a2", "a3", "a4"].map((id) => completedBooking(id));
    const rowOk = makeRow(batchId, {
      status: "ready",
      conflictResolution: "keep_csv",
      replaceBookingIds: completed.map((b) => b.id),
      unitId: villaProperty.units[0].id,
    });
    (rowOk as { tenantId: string }).tenantId = TENANT_ID;
    expect(() =>
      assertKeepCsvReplaceTargetsValid({
        row: rowOk,
        liveExistingBookingIds: completed.map((b) => b.id),
        targets: completed,
      }),
    ).not.toThrow();

    const confirmedTargets = ["c1", "c2", "c3", "c4"].map((id) => {
      const hold = createHoldForUnit(
        villaProperty.units[0].id,
        villaProperty.id,
        "2025-08-01",
        "2025-08-04",
        { holdId: `hold-${id}` },
      );
      const quote = Quote.createFromFixedTotal({
        id: `q-${id}`,
        snapshotId: `s-${id}`,
        hold,
        propertyTimezone: "Europe/Athens",
        total: Money.create("10.00", "EUR"),
        pricingMode: "imported_csv",
        quotedAt: new Date(HOLD_CREATED_AT.getTime() + 5_000),
      });
      const booking = Booking.create({
        id,
        hold,
        quote,
        guest: { name: "G", email: "g@t.com", phone: null },
        confirmationMode: "manual",
        now: new Date(HOLD_CREATED_AT.getTime() + 5_000),
      });
      booking.confirm(new Date(HOLD_CREATED_AT.getTime() + 6_000));
      booking.pullDomainEvents();
      return booking;
    });
    const rowConfirmed = makeRow(batchId, {
      conflictResolution: "keep_csv",
      replaceBookingIds: confirmedTargets.map((b) => b.id),
      unitId: villaProperty.units[0].id,
    });
    (rowConfirmed as { tenantId: string }).tenantId = TENANT_ID;
    expect(() =>
      assertKeepCsvReplaceTargetsValid({
        row: rowConfirmed,
        liveExistingBookingIds: confirmedTargets.map((b) => b.id),
        targets: confirmedTargets,
      }),
    ).not.toThrow();
  });

  it("accepts mixed completed+confirmed and rejects pending in mix", () => {
    const batchId = randomUUID();
    const completed = completedBooking("m-ok");
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
      { holdId: "hold-m-conf" },
    );
    const quote = Quote.createFromFixedTotal({
      id: "q-m-conf",
      snapshotId: "s-m-conf",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("10.00", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: new Date(HOLD_CREATED_AT.getTime() + 5_000),
    });
    const confirmed = Booking.create({
      id: "m-conf",
      hold,
      quote,
      guest: { name: "G", email: "g@t.com", phone: null },
      confirmationMode: "manual",
      now: new Date(HOLD_CREATED_AT.getTime() + 5_000),
    });
    confirmed.confirm(new Date(HOLD_CREATED_AT.getTime() + 6_000));
    confirmed.pullDomainEvents();

    const rowMixed = makeRow(batchId, {
      conflictResolution: "keep_csv",
      replaceBookingIds: ["m-ok", "m-conf"],
      unitId: villaProperty.units[0].id,
    });
    (rowMixed as { tenantId: string }).tenantId = TENANT_ID;
    expect(
      evaluateKeepCsvReplaceTargets({
        row: rowMixed,
        liveExistingBookingIds: ["m-ok", "m-conf"],
        targets: [completed, confirmed],
        requireLiveSetEquality: false,
      }),
    ).toBeNull();

    const holdPend = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
      { holdId: "hold-m-pend" },
    );
    const quotePend = Quote.createFromFixedTotal({
      id: "q-m-pend",
      snapshotId: "s-m-pend",
      hold: holdPend,
      propertyTimezone: "Europe/Athens",
      total: Money.create("10.00", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: new Date(HOLD_CREATED_AT.getTime() + 5_000),
    });
    const pending = Booking.create({
      id: "m-pend",
      hold: holdPend,
      quote: quotePend,
      guest: { name: "G", email: "g@t.com", phone: null },
      confirmationMode: "manual",
      now: new Date(HOLD_CREATED_AT.getTime() + 5_000),
    });
    pending.pullDomainEvents();
    const rowWithPending = makeRow(batchId, {
      conflictResolution: "keep_csv",
      replaceBookingIds: ["m-ok", "m-pend"],
      unitId: villaProperty.units[0].id,
    });
    (rowWithPending as { tenantId: string }).tenantId = TENANT_ID;
    const issue = evaluateKeepCsvReplaceTargets({
      row: rowWithPending,
      liveExistingBookingIds: ["m-ok", "m-pend"],
      targets: [completed, pending],
      requireLiveSetEquality: false,
    });
    expect(issue?.code).toBe("REPLACE_TARGET_NOT_SUPERSEDEABLE");
    expect(issue?.bookingId).toBe("m-pend");
  });

  it("evaluateKeepCsvReplaceTargets accepts confirmed and completed without live equality", () => {
    const batchId = randomUUID();
    const completed = completedBooking("b-completed");
    const hold = createHoldForUnit(
      villaProperty.units[0].id,
      villaProperty.id,
      "2025-08-01",
      "2025-08-04",
    );
    const quote = Quote.createFromFixedTotal({
      id: "q-eval",
      snapshotId: "s-eval",
      hold,
      propertyTimezone: "Europe/Athens",
      total: Money.create("100.00", "EUR"),
      pricingMode: "imported_csv",
      quotedAt: new Date(HOLD_CREATED_AT.getTime() + 5_000),
    });
    const confirmedOnly = Booking.create({
      id: "b-confirmed",
      hold,
      quote,
      guest: { name: "G", email: "g@t.com", phone: null },
      confirmationMode: "manual",
      now: new Date(HOLD_CREATED_AT.getTime() + 5_000),
    });
    confirmedOnly.confirm(new Date(HOLD_CREATED_AT.getTime() + 6_000));
    confirmedOnly.pullDomainEvents();

    const rowConfirmed = makeRow(batchId, {
      conflictResolution: "keep_csv",
      replaceBookingIds: ["b-confirmed"],
      unitId: villaProperty.units[0].id,
    });
    (rowConfirmed as { tenantId: string }).tenantId = TENANT_ID;

    expect(
      evaluateKeepCsvReplaceTargets({
        row: rowConfirmed,
        liveExistingBookingIds: ["b-confirmed"],
        targets: [confirmedOnly],
        requireLiveSetEquality: false,
      }),
    ).toBeNull();

    const rowOk = makeRow(batchId, {
      conflictResolution: "keep_csv",
      replaceBookingIds: [completed.id],
      unitId: villaProperty.units[0].id,
    });
    (rowOk as { tenantId: string }).tenantId = TENANT_ID;
    expect(
      evaluateKeepCsvReplaceTargets({
        row: rowOk,
        liveExistingBookingIds: [completed.id],
        targets: [completed],
        requireLiveSetEquality: false,
      }),
    ).toBeNull();
  });

  it("fail-closes keep_csv only for active channel links or missing probe; folio/payments warn only", async () => {
    const {
      evaluateKeepCsvReplaceTargetDependencies,
      collectKeepCsvReplaceTargetFinancialWarnings,
    } = await import("../../src/commerce/import/ReservationImportCommitRevalidation");
    expect(
      await evaluateKeepCsvReplaceTargetDependencies({
        tenantId: TENANT_ID,
        replaceBookingIds: ["b1"],
        probe: null,
      }),
    ).toMatchObject({ code: "REPLACE_TARGET_DEPS_UNAVAILABLE" });

    expect(
      await evaluateKeepCsvReplaceTargetDependencies({
        tenantId: TENANT_ID,
        replaceBookingIds: ["b1"],
        probe: {
          listChannelLinksByBookingId: async () => [{ status: "linked" }],
          listPaymentsByBookingId: async () => [],
          listFoliosByBookingId: async () => [],
        },
      }),
    ).toMatchObject({ code: "REPLACE_TARGET_HAS_CHANNEL_LINK", bookingId: "b1" });

    expect(
      await evaluateKeepCsvReplaceTargetDependencies({
        tenantId: TENANT_ID,
        replaceBookingIds: ["b1"],
        probe: {
          listChannelLinksByBookingId: async () => [{ status: "archived" }],
          listPaymentsByBookingId: async () => [{ id: "p1" }],
          listFoliosByBookingId: async () => [{ lines: [{ id: "l1" }] }],
          listFiscalDocumentsByBookingId: async () => [{ id: "fd1" }],
        },
      }),
    ).toBeNull();

    expect(
      await evaluateKeepCsvReplaceTargetDependencies({
        tenantId: TENANT_ID,
        replaceBookingIds: ["b1"],
        probe: {
          listChannelLinksByBookingId: async () => [],
          listPaymentsByBookingId: async () => [],
          listFoliosByBookingId: async () => [{ folio: { id: "f1" }, lines: [] }],
        },
      }),
    ).toBeNull();

    const warnings = await collectKeepCsvReplaceTargetFinancialWarnings({
      tenantId: TENANT_ID,
      bookingId: "b1",
      probe: {
        listChannelLinksByBookingId: async () => [],
        listPaymentsByBookingId: async () => [{ id: "p1" }],
        listFoliosByBookingId: async () => [{ lines: [{ id: "l1" }] }],
        listFiscalDocumentsByBookingId: async () => [{ id: "fd1" }],
      },
    });
    expect(warnings).toEqual({
      hasPayments: true,
      hasFolio: true,
      hasPostedFolioLines: true,
      hasFiscalDocuments: true,
    });
  });
});

describe("scanImportCalendarConflicts", () => {
  it("detects booking overlaps and non-booking blockers", () => {
    const scanned = scanImportCalendarConflicts({
      checkIn: "2026-12-01",
      checkOut: "2026-12-10",
      activeBlocks: [
        {
          blockType: "booking",
          status: "active",
          checkIn: "2026-12-02",
          checkOut: "2026-12-04",
          sourceId: "book-1",
        },
        {
          blockType: "owner",
          status: "active",
          checkIn: "2026-12-08",
          checkOut: "2026-12-09",
          sourceId: null,
        },
      ],
    });
    expect(scanned.existingBookingIds).toEqual(["book-1"]);
    expect(scanned.nonBookingBlockers).toHaveLength(1);
  });
});

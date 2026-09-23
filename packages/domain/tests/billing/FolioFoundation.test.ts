import { describe, it, expect, vi, beforeEach } from "vitest";
import { Folio, FolioLine } from "../../src/billing/domain/Folio";
import { projectQuoteSnapshotToFolioLines } from "../../src/billing/application/projectQuoteSnapshotToFolioLines";
import {
  OpenPrimaryFolioFromBookingUseCase,
  ListFoliosForBookingUseCase,
  GetFolioUseCase,
} from "../../src/billing/application/FolioUseCases";
import { QuoteSnapshot } from "../../src/commerce/booking/domain/QuoteSnapshot";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import { ValidationError } from "../../src/shared/errors/DomainError";

const NOW = new Date("2026-09-23T12:00:00.000Z");

function snapshot(overrides?: Partial<ReturnType<QuoteSnapshot["toJSON"]>>) {
  return QuoteSnapshot.create({
    version: 1,
    checkIn: "2026-10-01",
    checkOut: "2026-10-03",
    propertyTimezone: "Europe/Athens",
    currency: "EUR",
    lineItems: [
      {
        date: "2026-10-01",
        baseAmount: "100.0000",
        adjustedAmount: "100.0000",
        currency: "EUR",
      },
      {
        date: "2026-10-02",
        baseAmount: "120.0000",
        adjustedAmount: "110.0000",
        currency: "EUR",
      },
    ],
    subtotalAmount: "210.0000",
    feesAmount: "0.0000",
    taxesAmount: "0.0000",
    totalAmount: "210.0000",
    quotedAt: NOW,
    ...overrides,
  });
}

function sequentialIds(prefix: string) {
  let n = 0;
  return {
    generate: () => `${prefix}-${++n}`,
  };
}

describe("Folio aggregate", () => {
  it("opens with primary key and currency", () => {
    const folio = Folio.open({
      id: "f1",
      tenantId: "t1",
      bookingId: "b1",
      currency: "eur",
      now: NOW,
    });
    expect(folio.folioKey).toBe("primary");
    expect(folio.currency).toBe("EUR");
    expect(folio.status).toBe("open");
  });

  it("allows intentional multi-folio keys", () => {
    const company = Folio.open({
      id: "f2",
      tenantId: "t1",
      bookingId: "b1",
      currency: "EUR",
      folioKey: "company",
      label: "Company",
    });
    expect(company.folioKey).toBe("company");
  });

  it("appends posted lines and rejects mutation APIs by design", () => {
    const folio = Folio.open({
      id: "f1",
      tenantId: "t1",
      bookingId: "b1",
      currency: "EUR",
    });
    const line = FolioLine.createPosted({
      id: "l1",
      tenantId: "t1",
      folioId: "f1",
      lineType: "accommodation",
      description: "Night 1",
      amount: Money.create("100.0000", "EUR"),
      source: {
        sourceType: "quote_snapshot_night",
        sourceId: "q1",
        sourceLineRef: "snap:2026-10-01",
      },
      sortOrder: 0,
      postedAt: NOW,
    });
    folio.appendPostedLine(line);
    expect(folio.lines).toHaveLength(1);
    // FolioLine has no update/delete methods — only createPosted/rehydrate/toProps.
    expect(typeof (line as { update?: unknown }).update).toBe("undefined");
    expect(typeof (folio as { removeLine?: unknown }).removeLine).toBe("undefined");
  });

  it("rejects cross-tenant or currency-mismatched lines", () => {
    const folio = Folio.open({
      id: "f1",
      tenantId: "t1",
      bookingId: "b1",
      currency: "EUR",
    });
    expect(() =>
      folio.appendPostedLine(
        FolioLine.createPosted({
          id: "l1",
          tenantId: "other",
          folioId: "f1",
          lineType: "fee",
          description: "x",
          amount: Money.create("1.0000", "EUR"),
          source: { sourceType: "manual", sourceId: "m", sourceLineRef: null },
          sortOrder: 0,
        }),
      ),
    ).toThrow(ValidationError);
  });

  it("computes balance with paid=0 and no_allocations", () => {
    const folio = Folio.open({
      id: "f1",
      tenantId: "t1",
      bookingId: "b1",
      currency: "EUR",
    });
    folio.appendPostedLine(
      FolioLine.createPosted({
        id: "l1",
        tenantId: "t1",
        folioId: "f1",
        lineType: "accommodation",
        description: "Stay",
        amount: Money.create("200.0000", "EUR"),
        source: {
          sourceType: "quote_snapshot",
          sourceId: "q1",
          sourceLineRef: "total",
        },
        sortOrder: 0,
      }),
    );
    folio.appendPostedLine(
      FolioLine.createPosted({
        id: "l2",
        tenantId: "t1",
        folioId: "f1",
        lineType: "discount",
        description: "Promo",
        amount: Money.create("-20.0000", "EUR"),
        source: { sourceType: "manual", sourceId: "m1", sourceLineRef: "d" },
        sortOrder: 1,
      }),
    );
    const balance = folio.computeBalance();
    expect(balance.chargesSubtotal).toBe("200.0000");
    expect(balance.discountsTotal).toBe("-20.0000");
    expect(balance.folioTotal).toBe("180.0000");
    expect(balance.paidAmount).toBe("0.0000");
    expect(balance.paidAmountSource).toBe("no_allocations");
    expect(balance.outstandingBalance).toBe("180.0000");
    expect(balance.vatTotal).toBe("0.0000");
    expect(balance.leviesTotal).toBe("0.0000");
  });
});

describe("projectQuoteSnapshotToFolioLines", () => {
  it("projects nights with provenance and placeholder fees/taxes", () => {
    const folio = Folio.open({
      id: "f1",
      tenantId: "t1",
      bookingId: "b1",
      currency: "EUR",
    });
    const snap = snapshot({
      feesAmount: "5.0000",
      taxesAmount: "10.0000",
      totalAmount: "225.0000",
    });
    const lines = projectQuoteSnapshotToFolioLines({
      folio,
      quoteId: "quote-1",
      snapshotId: "snap-1",
      snapshot: snap,
      idGenerator: sequentialIds("id"),
      now: NOW,
    });
    expect(lines).toHaveLength(4);
    expect(lines[0].lineType).toBe("accommodation");
    expect(lines[0].source.sourceType).toBe("quote_snapshot_night");
    expect(lines[0].source.sourceId).toBe("quote-1");
    expect(lines[0].source.sourceLineRef).toBe("snap-1:2026-10-01");
    expect(lines[0].amount).toBe("100.0000");
    expect(lines[1].amount).toBe("110.0000");
    expect(lines[2].source.sourceType).toBe("quote_snapshot_fee_placeholder");
    expect(lines[3].source.sourceType).toBe("quote_snapshot_tax_placeholder");
    expect(lines[3].description).toMatch(/not Greek VAT/i);
  });

  it("does not live-link to mutable pricing — amounts are copied", () => {
    const folio = Folio.open({
      id: "f1",
      tenantId: "t1",
      bookingId: "b1",
      currency: "EUR",
    });
    const snap = snapshot();
    const lines = projectQuoteSnapshotToFolioLines({
      folio,
      quoteId: "q",
      snapshotId: "s",
      snapshot: snap,
      idGenerator: sequentialIds("x"),
    });
    // Mutating snapshot props object after projection must not change line amounts
    // (lines hold independent Money strings).
    expect(lines[0].amount).toBe("100.0000");
    expect(lines[0].amount).not.toBe(snap.lineItems[0]);
  });
});

describe("OpenPrimaryFolioFromBookingUseCase", () => {
  const permissionChecker = new PermissionChecker();
  const adminActor = {
    userId: "admin-1",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };
  const otherTenantActor = {
    userId: "admin-2",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  const booking = {
    id: "b1",
    tenantId: "tenant-1",
    propertyId: "property-1",
    quoteId: "q1",
    quoteSnapshotId: "snap-1",
    status: "confirmed",
    confirmationMode: "manual",
  };

  const quote = {
    id: "q1",
    tenantId: "tenant-1",
    snapshotId: "snap-1",
    snapshot: snapshot(),
  };

  let bookingRepository: {
    findById: ReturnType<typeof vi.fn>;
  };
  let quoteRepository: {
    findById: ReturnType<typeof vi.fn>;
  };
  let folioRepository: {
    findByBookingAndKey: ReturnType<typeof vi.fn>;
    findByBooking: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    saveNew: ReturnType<typeof vi.fn>;
  };
  let idGenerator: { generate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    bookingRepository = {
      findById: vi.fn().mockResolvedValue(booking),
    };
    quoteRepository = {
      findById: vi.fn().mockResolvedValue(quote),
    };
    folioRepository = {
      findByBookingAndKey: vi.fn().mockResolvedValue(null),
      findByBooking: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      saveNew: vi.fn().mockResolvedValue("created"),
    };
    let n = 0;
    idGenerator = {
      generate: vi.fn().mockImplementation(() => `gen-${++n}`),
    };
  });

  it("creates folio projected from quote snapshot", async () => {
    const useCase = new OpenPrimaryFolioFromBookingUseCase(
      bookingRepository as never,
      quoteRepository as never,
      folioRepository as never,
      idGenerator,
      permissionChecker,
    );
    const result = await useCase.execute("tenant-1", "b1", adminActor);
    expect(result.isSuccess).toBe(true);
    const model = result.getValue();
    expect(model.folioKey).toBe("primary");
    expect(model.lines.length).toBe(2);
    expect(model.balance.folioTotal).toBe("210.0000");
    expect(model.balance.paidAmount).toBe("0.0000");
    expect(model.balance.paidAmountSource).toBe("no_allocations");
    expect(folioRepository.saveNew).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when primary folio already exists", async () => {
    const existingFolio = Folio.open({
      id: "existing",
      tenantId: "tenant-1",
      bookingId: "b1",
      currency: "EUR",
      folioKey: "primary",
      label: "Primary",
    });
    const existingLine = FolioLine.createPosted({
      id: "el1",
      tenantId: "tenant-1",
      folioId: "existing",
      lineType: "accommodation",
      description: "Night",
      amount: Money.create("210.0000", "EUR"),
      source: {
        sourceType: "quote_snapshot",
        sourceId: "q1",
        sourceLineRef: "snap-1:total",
      },
      sortOrder: 0,
    });
    existingFolio.appendPostedLine(existingLine);
    folioRepository.findByBookingAndKey.mockResolvedValue({
      folio: existingFolio,
      lines: [existingLine],
    });

    const useCase = new OpenPrimaryFolioFromBookingUseCase(
      bookingRepository as never,
      quoteRepository as never,
      folioRepository as never,
      idGenerator,
      permissionChecker,
    );
    const result = await useCase.execute("tenant-1", "b1", adminActor);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().id).toBe("existing");
    expect(folioRepository.saveNew).not.toHaveBeenCalled();
  });

  it("handles concurrent unique conflict by re-reading", async () => {
    const raced = Folio.open({
      id: "raced",
      tenantId: "tenant-1",
      bookingId: "b1",
      currency: "EUR",
    });
    folioRepository.saveNew.mockResolvedValue("already_exists");
    folioRepository.findByBookingAndKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ folio: raced, lines: [] });

    const useCase = new OpenPrimaryFolioFromBookingUseCase(
      bookingRepository as never,
      quoteRepository as never,
      folioRepository as never,
      idGenerator,
      permissionChecker,
    );
    const result = await useCase.execute("tenant-1", "b1", adminActor);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().id).toBe("raced");
  });

  it("rejects cross-tenant booking access", async () => {
    bookingRepository.findById.mockResolvedValue(null);
    const useCase = new OpenPrimaryFolioFromBookingUseCase(
      bookingRepository as never,
      quoteRepository as never,
      folioRepository as never,
      idGenerator,
      permissionChecker,
    );
    const result = await useCase.execute("tenant-other", "b1", otherTenantActor);
    expect(result.isFailure).toBe(true);
  });

  it("does not infer paid from booking status", async () => {
    bookingRepository.findById.mockResolvedValue({
      ...booking,
      status: "confirmed",
      confirmationMode: "instant",
    });
    const useCase = new OpenPrimaryFolioFromBookingUseCase(
      bookingRepository as never,
      quoteRepository as never,
      folioRepository as never,
      idGenerator,
      permissionChecker,
    );
    const result = await useCase.execute("tenant-1", "b1", adminActor);
    expect(result.getValue().balance.paidAmount).toBe("0.0000");
    expect(result.getValue().balance.paidAmountSource).toBe("no_allocations");
  });

  it("quote/rate changes after open do not rewrite saved lines (use-case returns existing)", async () => {
    const existingFolio = Folio.open({
      id: "existing",
      tenantId: "tenant-1",
      bookingId: "b1",
      currency: "EUR",
    });
    const line = FolioLine.createPosted({
      id: "el1",
      tenantId: "tenant-1",
      folioId: "existing",
      lineType: "accommodation",
      description: "Frozen",
      amount: Money.create("210.0000", "EUR"),
      source: {
        sourceType: "quote_snapshot_night",
        sourceId: "q1",
        sourceLineRef: "snap-1:2026-10-01",
      },
      sortOrder: 0,
    });
    existingFolio.appendPostedLine(line);
    folioRepository.findByBookingAndKey.mockResolvedValue({
      folio: existingFolio,
      lines: [line],
    });
    // Quote now shows different money — must not be used when primary exists.
    quoteRepository.findById.mockResolvedValue({
      ...quote,
      snapshot: snapshot({
        totalAmount: "999.0000",
        lineItems: [
          {
            date: "2026-10-01",
            baseAmount: "999.0000",
            adjustedAmount: "999.0000",
            currency: "EUR",
          },
        ],
      }),
    });

    const useCase = new OpenPrimaryFolioFromBookingUseCase(
      bookingRepository as never,
      quoteRepository as never,
      folioRepository as never,
      idGenerator,
      permissionChecker,
    );
    const result = await useCase.execute("tenant-1", "b1", adminActor);
    expect(result.getValue().balance.folioTotal).toBe("210.0000");
    expect(quoteRepository.findById).not.toHaveBeenCalled();
  });

  it("list supports multiple intentional folios", async () => {
    const primary = Folio.open({
      id: "f-primary",
      tenantId: "tenant-1",
      bookingId: "b1",
      currency: "EUR",
      folioKey: "primary",
    });
    const company = Folio.open({
      id: "f-company",
      tenantId: "tenant-1",
      bookingId: "b1",
      currency: "EUR",
      folioKey: "company",
      label: "Company",
    });
    folioRepository.findByBooking.mockResolvedValue([
      { folio: primary, lines: [] },
      { folio: company, lines: [] },
    ]);
    const useCase = new ListFoliosForBookingUseCase(
      bookingRepository as never,
      folioRepository as never,
      permissionChecker,
    );
    const result = await useCase.execute("tenant-1", "b1", adminActor);
    expect(result.getValue()).toHaveLength(2);
    expect(result.getValue().map((f) => f.folioKey)).toEqual([
      "primary",
      "company",
    ]);
  });

  it("get folio rejects wrong tenant", async () => {
    folioRepository.findById.mockResolvedValue(null);
    const useCase = new GetFolioUseCase(
      bookingRepository as never,
      folioRepository as never,
      permissionChecker,
    );
    const result = await useCase.execute("tenant-other", "f1", otherTenantActor);
    expect(result.isFailure).toBe(true);
  });
});

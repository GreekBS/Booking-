import { describe, it, expect, vi } from "vitest";
import {
  CreateDirectBookingHoldUseCase,
  Hold,
  Quote,
  ConflictError,
  ForbiddenError,
  ValidationError,
  Result,
  type DirectBookingCatalogSnapshot,
  type DirectBookingIntegrationPublicLookup,
  type PricingResult,
  Money,
} from "../../src/index";

const activeCatalog = (): DirectBookingCatalogSnapshot => ({
  property: {
    id: "prop-1",
    tenantId: "tenant-1",
    name: "Pilot Villa",
    slug: "pilot-villa",
    type: "villa",
    status: "active",
    timezone: "Europe/Athens",
    deletedAt: null,
  },
  unit: {
    id: "unit-1",
    propertyId: "prop-1",
    name: "Entire Property",
    slug: "entire-property",
    status: "active",
    maxGuests: 4,
    bedrooms: 2,
    bathrooms: 1,
    deletedAt: null,
  },
  currency: "EUR",
  hasRatePlan: true,
  stayRules: {
    minNights: 3,
    maxNights: 30,
    checkInDays: [0, 1, 2, 3, 4, 5, 6],
    checkOutDays: [0, 1, 2, 3, 4, 5, 6],
    advanceMinDays: 0,
    advanceMaxDays: 365,
    turnoverNights: 0,
  },
});

const activeIntegration = (): DirectBookingIntegrationPublicLookup => ({
  id: "int-1",
  tenantId: "tenant-1",
  propertyId: "prop-1",
  unitId: "unit-1",
  environment: "live",
  allowedOrigins: ["https://oliveandraki.gr"],
  status: "active",
});

function makeHold(overrides?: Partial<{ checkIn: string; checkOut: string; guestCount: number; ttlSeconds: number; id: string }>) {
  return Hold.create({
    id: overrides?.id ?? "hold-1",
    tenantId: "tenant-1",
    unitId: "unit-1",
    propertyId: "prop-1",
    checkIn: overrides?.checkIn ?? "2026-12-10",
    checkOut: overrides?.checkOut ?? "2026-12-13",
    guestCount: overrides?.guestCount ?? 2,
    ttlSeconds: overrides?.ttlSeconds ?? 900,
    sessionRef: "idem-key-abc12345",
  });
}

function makeQuote(hold: Hold, total = "450.0000") {
  const pricing: PricingResult = {
    currency: "EUR",
    subtotal: Money.create(total, "EUR"),
    losDiscountAmount: Money.create("0.0000", "EUR"),
    total: Money.create(total, "EUR"),
    lineItems: [
      { date: "2026-12-10", baseAmount: "150.0000", adjustedAmount: "150.0000", currency: "EUR" },
      { date: "2026-12-11", baseAmount: "150.0000", adjustedAmount: "150.0000", currency: "EUR" },
      { date: "2026-12-12", baseAmount: "150.0000", adjustedAmount: "150.0000", currency: "EUR" },
    ],
    quotedAt: new Date("2026-10-01T12:00:00.000Z"),
  };
  return Quote.create({
    id: "quote-1",
    snapshotId: "snap-1",
    hold,
    pricing,
    propertyTimezone: "Europe/Athens",
  });
}

function buildUseCase(opts?: {
  integration?: DirectBookingIntegrationPublicLookup;
  catalog?: DirectBookingCatalogSnapshot | null;
  ttlSeconds?: number;
  prepareHold?: ReturnType<typeof vi.fn>;
  prepareQuote?: ReturnType<typeof vi.fn>;
  existingIdempotencyHoldId?: string | null;
  existingHold?: Hold | null;
  existingQuote?: Quote | null;
  saveHoldAndQuote?: ReturnType<typeof vi.fn>;
}) {
  const hold = makeHold({ ttlSeconds: opts?.ttlSeconds ?? 900 });
  const quote = makeQuote(hold);
  hold.pullDomainEvents();
  quote.pullDomainEvents();

  const prepareHold =
    opts?.prepareHold ??
    vi.fn().mockResolvedValue(Result.ok(makeHold({ ttlSeconds: opts?.ttlSeconds ?? 900 })));
  const prepareQuote =
    opts?.prepareQuote ??
    vi.fn().mockImplementation(async ({ hold: h }: { hold: Hold }) => Result.ok(makeQuote(h)));

  const saveHoldAndQuote =
    opts?.saveHoldAndQuote ?? vi.fn().mockResolvedValue(undefined);

  const idempotency = {
    findResourceId: vi.fn().mockResolvedValue(opts?.existingIdempotencyHoldId ?? null),
    save: vi.fn().mockResolvedValue(undefined),
  };

  const holdRepository = {
    findById: vi.fn().mockResolvedValue(opts?.existingHold ?? null),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    save: vi.fn(),
  };

  const quoteRepository = {
    findByHoldId: vi.fn().mockResolvedValue(opts?.existingQuote ?? null),
    findById: vi.fn(),
    save: vi.fn(),
  };

  const useCase = new CreateDirectBookingHoldUseCase(
    {
      getCatalogSnapshot: vi.fn().mockResolvedValue(
        opts?.catalog === undefined ? activeCatalog() : opts.catalog,
      ),
    } as never,
    {
      prepareHold,
      prepareQuoteForHold: prepareQuote,
    } as never,
    {
      findByTenantId: vi.fn().mockResolvedValue({
        tenantId: "tenant-1",
        defaultHoldTtlSeconds: opts?.ttlSeconds ?? 900,
        confirmationMode: "manual",
        defaultCurrency: "EUR",
      }),
    } as never,
    holdRepository as never,
    quoteRepository as never,
    { saveHoldAndQuote } as never,
    idempotency as never,
    { generate: vi.fn().mockReturnValueOnce("hold-gen").mockReturnValueOnce("quote-gen").mockReturnValue("snap-gen") },
  );

  return {
    useCase,
    prepareHold,
    prepareQuote,
    saveHoldAndQuote,
    idempotency,
    holdRepository,
    quoteRepository,
  };
}

describe("CreateDirectBookingHoldUseCase", () => {
  it("creates Hold + persisted Quote with authoritative total for a 3-night stay", async () => {
    const { useCase, prepareHold, saveHoldAndQuote, idempotency } = buildUseCase({
      ttlSeconds: 1200,
    });

    const result = await useCase.execute(activeIntegration(), {
      checkIn: "2026-12-10",
      checkOut: "2026-12-13",
      guestCount: 2,
      idempotencyKey: "idem-key-abc12345",
    });

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.status).toBe("active");
    expect(dto.total).toBe("450.0000");
    expect(dto.currency).toBe("EUR");
    expect(dto.guestCount).toBe(2);
    expect(dto.checkIn).toBe("2026-12-10");
    expect(dto.checkOut).toBe("2026-12-13");
    expect(dto.holdId).toBeTruthy();
    expect(dto.quoteId).toBeTruthy();
    expect(JSON.stringify(dto)).not.toContain("tenant-1");
    expect(JSON.stringify(dto)).not.toContain("prop-1");
    expect(JSON.stringify(dto)).not.toContain("unit-1");

    expect(prepareHold).toHaveBeenCalledWith(
      expect.objectContaining({
        ttlSeconds: 1200,
        unitId: "unit-1",
        sessionRef: "idem-key-abc12345",
      }),
    );
    expect(saveHoldAndQuote).toHaveBeenCalledTimes(1);
    expect(idempotency.save).toHaveBeenCalledWith(
      "tenant-1",
      "dbk_hold",
      "idem-key-abc12345",
      expect.any(String),
      expect.any(Date),
    );
  });

  it("fails closed for draft integration", async () => {
    const { useCase, saveHoldAndQuote } = buildUseCase();
    const draft = activeIntegration();
    draft.status = "draft";
    const result = await useCase.execute(draft, {
      checkIn: "2026-12-10",
      checkOut: "2026-12-13",
      guestCount: 2,
      idempotencyKey: "idem-key-abc12345",
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
    expect(saveHoldAndQuote).not.toHaveBeenCalled();
  });

  it("rejects guest count above unit max", async () => {
    const { useCase, saveHoldAndQuote } = buildUseCase();
    const result = await useCase.execute(activeIntegration(), {
      checkIn: "2026-12-10",
      checkOut: "2026-12-13",
      guestCount: 5,
      idempotencyKey: "idem-key-abc12345",
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
    expect(saveHoldAndQuote).not.toHaveBeenCalled();
  });

  it("rejects unavailable stays (min nights / blocked)", async () => {
    const { useCase, saveHoldAndQuote } = buildUseCase({
      prepareHold: vi
        .fn()
        .mockResolvedValue(Result.fail(new ValidationError("Stay requires at least 3 nights"))),
    });
    const result = await useCase.execute(activeIntegration(), {
      checkIn: "2026-12-10",
      checkOut: "2026-12-12",
      guestCount: 2,
      idempotencyKey: "idem-key-abc12345",
    });
    expect(result.isFailure).toBe(true);
    expect(saveHoldAndQuote).not.toHaveBeenCalled();
  });

  it("maps inventory exclusion conflicts to ConflictError", async () => {
    const { useCase } = buildUseCase({
      saveHoldAndQuote: vi
        .fn()
        .mockRejectedValue(new ConflictError("Dates no longer available")),
    });
    const result = await useCase.execute(activeIntegration(), {
      checkIn: "2026-12-10",
      checkOut: "2026-12-13",
      guestCount: 2,
      idempotencyKey: "idem-key-abc12345",
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
  });

  it("idempotent replay returns the same logical Hold without saving again", async () => {
    const existing = makeHold();
    existing.pullDomainEvents();
    const existingQuote = makeQuote(existing);
    existingQuote.pullDomainEvents();

    const { useCase, saveHoldAndQuote, idempotency } = buildUseCase({
      existingIdempotencyHoldId: existing.id,
      existingHold: existing,
      existingQuote,
    });

    const result = await useCase.execute(activeIntegration(), {
      checkIn: "2026-12-10",
      checkOut: "2026-12-13",
      guestCount: 2,
      idempotencyKey: "idem-key-abc12345",
    });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().holdId).toBe(existing.id);
    expect(result.getValue().total).toBe("450.0000");
    expect(saveHoldAndQuote).not.toHaveBeenCalled();
    expect(idempotency.save).not.toHaveBeenCalled();
  });

  it("rejects same idempotency key with different payload", async () => {
    const existing = makeHold();
    existing.pullDomainEvents();
    const { useCase, saveHoldAndQuote } = buildUseCase({
      existingIdempotencyHoldId: existing.id,
      existingHold: existing,
      existingQuote: makeQuote(existing),
    });

    const result = await useCase.execute(activeIntegration(), {
      checkIn: "2026-12-10",
      checkOut: "2026-12-14",
      guestCount: 2,
      idempotencyKey: "idem-key-abc12345",
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
    expect(result.getError().message).toMatch(/different request/i);
    expect(saveHoldAndQuote).not.toHaveBeenCalled();
  });

  it("does not create Booking or Guest side effects (only saveHoldAndQuote)", async () => {
    const { useCase, saveHoldAndQuote } = buildUseCase();
    await useCase.execute(activeIntegration(), {
      checkIn: "2026-12-10",
      checkOut: "2026-12-13",
      guestCount: 2,
      idempotencyKey: "idem-key-abc12345",
    });
    expect(saveHoldAndQuote).toHaveBeenCalledTimes(1);
    const [holdArg, quoteArg] = saveHoldAndQuote.mock.calls[0]!;
    expect(holdArg).toBeInstanceOf(Hold);
    expect(quoteArg).toBeInstanceOf(Quote);
  });
});

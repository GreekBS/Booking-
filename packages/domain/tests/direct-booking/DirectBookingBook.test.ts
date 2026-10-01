import { describe, it, expect, vi } from "vitest";
import {
  CreateDirectBookingBookUseCase,
  Hold,
  Quote,
  Booking,
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

function makeHold(overrides?: {
  id?: string;
  ttlSeconds?: number;
  status?: "active";
  propertyId?: string;
  unitId?: string;
  tenantId?: string;
}) {
  return Hold.create({
    id: overrides?.id ?? "hold-1",
    tenantId: overrides?.tenantId ?? "tenant-1",
    unitId: overrides?.unitId ?? "unit-1",
    propertyId: overrides?.propertyId ?? "prop-1",
    checkIn: "2026-12-10",
    checkOut: "2026-12-13",
    guestCount: 2,
    ttlSeconds: overrides?.ttlSeconds ?? 900,
    sessionRef: "hold-session-key-01",
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

function makeBooking(hold: Hold, quote: Quote) {
  return Booking.create({
    id: "booking-1",
    hold,
    quote,
    guest: {
      name: "Maria Papadopoulos",
      email: "maria@example.com",
      phone: "+306912345678",
    },
    guestId: "guest-1",
    confirmationMode: "manual",
  });
}

const baseCommand = {
  holdId: "hold-1",
  guest: {
    firstName: "Maria",
    lastName: "Papadopoulos",
    email: "maria@example.com",
    phone: "+306912345678",
    country: "GR",
  },
  acceptedTerms: true as const,
  idempotencyKey: "book-key-12345678",
};

function buildUseCase(opts?: {
  integration?: DirectBookingIntegrationPublicLookup;
  catalog?: DirectBookingCatalogSnapshot | null;
  hold?: Hold | null;
  quote?: Quote | null;
  bookingResult?: Result<Booking, Error>;
  idempotencyResourceId?: string | null;
  existingBooking?: Booking | null;
}) {
  const hold = opts?.hold === undefined ? makeHold() : opts.hold;
  const quote =
    opts?.quote === undefined
      ? hold
        ? makeQuote(hold)
        : null
      : opts.quote;

  const createBookingExecute = vi.fn().mockImplementation(async () => {
    if (opts?.bookingResult) return opts.bookingResult;
    if (!hold || !quote) {
      return Result.fail(new ValidationError("missing"));
    }
    // Recreate hold+quote for Booking.create (hold must still be active)
    const liveHold = makeHold({ id: hold.id });
    const liveQuote = makeQuote(liveHold, quote.snapshot.totalAmount);
    const booking = makeBooking(liveHold, liveQuote);
    return Result.ok(booking);
  });

  const idempotencySave = vi.fn().mockResolvedValue(undefined);
  const useCase = new CreateDirectBookingBookUseCase(
    {
      getCatalogSnapshot: vi.fn().mockResolvedValue(
        opts?.catalog === undefined ? activeCatalog() : opts.catalog,
      ),
    } as never,
    {
      findById: vi.fn().mockResolvedValue(hold),
    } as never,
    {
      findByHoldId: vi.fn().mockResolvedValue(quote),
      findById: vi.fn().mockResolvedValue(quote),
    } as never,
    {
      findById: vi.fn().mockResolvedValue(opts?.existingBooking ?? null),
    } as never,
    {
      execute: createBookingExecute,
    } as never,
    {
      findResourceId: vi.fn().mockResolvedValue(opts?.idempotencyResourceId ?? null),
      save: idempotencySave,
    } as never,
  );

  return {
    useCase,
    createBookingExecute,
    idempotencySave,
    integration: opts?.integration ?? activeIntegration(),
  };
}

describe("CreateDirectBookingBookUseCase", () => {
  it("converts Hold+Quote into pending Booking with authoritative €450 total", async () => {
    const { useCase, createBookingExecute, idempotencySave, integration } = buildUseCase();
    const result = await useCase.execute(integration, baseCommand);

    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.status).toBe("pending");
    expect(dto.total).toBe("450.0000");
    expect(dto.currency).toBe("EUR");
    expect(dto.nights).toBe(3);
    expect(dto.guestCount).toBe(2);
    expect(dto.guestEmail).toBe("maria@example.com");
    expect(dto.confirmationCode).toMatch(/^HCP-[A-Z0-9]{6}$/);
    expect(JSON.stringify(dto)).not.toContain("tenant-1");
    expect(JSON.stringify(dto)).not.toContain("prop-1");
    expect(JSON.stringify(dto)).not.toContain("unit-1");
    expect(JSON.stringify(dto)).not.toContain("guest-1");

    expect(createBookingExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        quoteId: "quote-1",
        confirmationMode: "manual",
        guest: expect.objectContaining({
          name: "Maria Papadopoulos",
          email: "maria@example.com",
          phone: "+306912345678",
          firstName: "Maria",
          lastName: "Papadopoulos",
          country: "GR",
        }),
      }),
      expect.objectContaining({ userId: "direct-booking:tenant-1" }),
    );
    expect(idempotencySave).toHaveBeenCalledWith(
      "tenant-1",
      "dbk_booking",
      "book-key-12345678",
      "booking-1",
      expect.any(Date),
    );
  });

  it("fails closed for draft integration", async () => {
    const { useCase } = buildUseCase({
      integration: { ...activeIntegration(), status: "draft" },
    });
    const result = await useCase.execute(
      { ...activeIntegration(), status: "draft" },
      baseCommand,
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("rejects cross-integration Hold ownership", async () => {
    const { useCase, integration } = buildUseCase({
      hold: makeHold({ propertyId: "other-prop", unitId: "other-unit" }),
    });
    const result = await useCase.execute(integration, baseCommand);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
  });

  it("rejects logically expired Hold even if status is still active", async () => {
    const hold = makeHold({ ttlSeconds: 900 });
    const quote = makeQuote(hold);
    Object.defineProperty(hold, "isExpired", {
      value: () => true,
    });
    const { useCase, integration, createBookingExecute } = buildUseCase({ hold, quote });
    const result = await useCase.execute(integration, baseCommand);
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
    expect(result.getError().message.toLowerCase()).toContain("expired");
    expect(createBookingExecute).not.toHaveBeenCalled();
  });

  it("replays same idempotency key to the same Booking", async () => {
    const hold = makeHold();
    const quote = makeQuote(hold);
    // Booking.create converts hold — use separate hold instance for create
    const bookingHold = makeHold();
    const bookingQuote = makeQuote(bookingHold);
    const booking = makeBooking(bookingHold, bookingQuote);

    const { useCase, createBookingExecute, integration } = buildUseCase({
      idempotencyResourceId: "booking-1",
      existingBooking: booking,
      quote: bookingQuote,
    });

    const result = await useCase.execute(integration, baseCommand);
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().bookingId).toBe("booking-1");
    expect(result.getValue().total).toBe("450.0000");
    expect(createBookingExecute).not.toHaveBeenCalled();
  });

  it("rejects same idempotency key with different guest payload", async () => {
    const hold = makeHold();
    const quote = makeQuote(hold);
    const bookingHold = makeHold();
    const booking = makeBooking(bookingHold, makeQuote(bookingHold));

    const { useCase, integration } = buildUseCase({
      idempotencyResourceId: "booking-1",
      existingBooking: booking,
      quote,
    });

    const result = await useCase.execute(integration, {
      ...baseCommand,
      guest: { ...baseCommand.guest, email: "other@example.com" },
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().message.toLowerCase()).toContain("idempotency");
  });

  it("rejects acceptedTerms gate when false reaches use case", async () => {
    const { useCase, integration } = buildUseCase();
    const result = await useCase.execute(integration, {
      ...baseCommand,
      acceptedTerms: false as unknown as true,
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
  });
});

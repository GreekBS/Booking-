import { randomUUID } from "node:crypto";
import { beforeEach, afterAll, it, expect } from "vitest";
import {
  Hold,
  Quote,
  Booking,
  PricingCalculator,
  Folio,
  FolioLine,
  Money,
} from "@hcp/domain";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaFolioRepository } from "../../src/repositories/billing/FolioRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import {
  truncateIntegrationTables,
  prisma,
  setTenantContext,
  clearTenantContext,
} from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";

runIntegration("FolioRepository integration (F1)", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const ratePlanRepository = new PrismaRatePlanRepository();
  const folioRepository = new PrismaFolioRepository();

  const tenantId = "550e8400-e29b-41d4-a716-446655443010";
  const otherTenantId = "550e8400-e29b-41d4-a716-446655443011";
  const propertyId = "550e8400-e29b-41d4-a716-446655443012";
  const unitId = "550e8400-e29b-41d4-a716-446655443013";
  const otherPropertyId = "550e8400-e29b-41d4-a716-446655443014";
  const otherUnitId = "550e8400-e29b-41d4-a716-446655443015";

  async function seedBooking(ids: {
    holdId: string;
    quoteId: string;
    snapshotId: string;
    bookingId: string;
    tenantId: string;
    propertyId: string;
    unitId: string;
  }) {
    const hold = Hold.create({
      id: ids.holdId,
      tenantId: ids.tenantId,
      unitId: ids.unitId,
      propertyId: ids.propertyId,
      checkIn: "2026-12-01",
      checkOut: "2026-12-03",
      guestCount: 2,
    });
    await holdRepository.save(hold);

    const ratePlan = await ratePlanRepository.findByUnitId(ids.unitId, ids.tenantId);
    expect(ratePlan).not.toBeNull();
    const pricing = new PricingCalculator().calculate(
      ratePlan!,
      hold.stayPeriod,
      new Date("2026-06-01T12:00:00.000Z"),
    );
    const quote = Quote.create({
      id: ids.quoteId,
      snapshotId: ids.snapshotId,
      hold,
      pricing,
      propertyTimezone: "Europe/Athens",
    });
    await quoteRepository.save(quote);

    const booking = Booking.create({
      id: ids.bookingId,
      hold,
      quote,
      guest: { name: "Ada Lovelace", email: "ada@example.com", phone: null },
      confirmationMode: "manual",
    });
    await bookingRepository.save(booking);
    return { hold, quote, booking };
  }

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
    await seedCommerceFixture({
      tenantId: otherTenantId,
      propertyId: otherPropertyId,
      unitId: otherUnitId,
    });
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("persists folio + lines and is idempotent on primary key", async () => {
    const bookingId = "550e8400-e29b-41d4-a716-446655443020";
    const { quote, booking } = await seedBooking({
      holdId: "550e8400-e29b-41d4-a716-446655443021",
      quoteId: "550e8400-e29b-41d4-a716-446655443022",
      snapshotId: "550e8400-e29b-41d4-a716-446655443023",
      bookingId,
      tenantId,
      propertyId,
      unitId,
    });

    const folioId = "550e8400-e29b-41d4-a716-446655443024";
    const folio = Folio.open({
      id: folioId,
      tenantId,
      bookingId: booking.id,
      currency: quote.snapshot.currency,
      folioKey: Folio.primaryKey(),
      label: "Primary",
    });
    const line = FolioLine.createPosted({
      id: "550e8400-e29b-41d4-a716-446655443025",
      tenantId,
      folioId,
      lineType: "accommodation",
      description: "Accommodation 2026-12-01",
      amount: Money.create(quote.snapshot.lineItems[0].adjustedAmount, "EUR"),
      source: {
        sourceType: "quote_snapshot_night",
        sourceId: quote.id,
        sourceLineRef: `${quote.snapshotId}:2026-12-01`,
      },
      sortOrder: 0,
    });
    folio.appendPostedLine(line);

    expect(await folioRepository.saveNew(folio)).toBe("created");
    expect(await folioRepository.saveNew(folio)).toBe("already_exists");

    const loaded = await folioRepository.findByBookingAndKey(
      tenantId,
      bookingId,
      "primary",
    );
    expect(loaded?.lines).toHaveLength(1);
    expect(loaded?.lines[0].amount).toBe(
      quote.snapshot.lineItems[0].adjustedAmount,
    );
    expect(loaded?.lines[0].source.sourceType).toBe("quote_snapshot_night");
  });

  it("allows multiple intentional folios per booking", async () => {
    const bookingId = "550e8400-e29b-41d4-a716-446655443030";
    await seedBooking({
      holdId: "550e8400-e29b-41d4-a716-446655443031",
      quoteId: "550e8400-e29b-41d4-a716-446655443032",
      snapshotId: "550e8400-e29b-41d4-a716-446655443033",
      bookingId,
      tenantId,
      propertyId,
      unitId,
    });

    const primary = Folio.open({
      id: "550e8400-e29b-41d4-a716-446655443034",
      tenantId,
      bookingId,
      currency: "EUR",
      folioKey: "primary",
    });
    const company = Folio.open({
      id: "550e8400-e29b-41d4-a716-446655443035",
      tenantId,
      bookingId,
      currency: "EUR",
      folioKey: "company",
      label: "Company",
    });
    expect(await folioRepository.saveNew(primary)).toBe("created");
    expect(await folioRepository.saveNew(company)).toBe("created");

    const list = await folioRepository.findByBooking(tenantId, bookingId);
    expect(list).toHaveLength(2);
    expect(list.map((f) => f.folio.folioKey).sort()).toEqual([
      "company",
      "primary",
    ]);
  });

  it("does not return another tenant's folio", async () => {
    const bookingId = "550e8400-e29b-41d4-a716-446655443040";
    await seedBooking({
      holdId: "550e8400-e29b-41d4-a716-446655443041",
      quoteId: "550e8400-e29b-41d4-a716-446655443042",
      snapshotId: "550e8400-e29b-41d4-a716-446655443043",
      bookingId,
      tenantId,
      propertyId,
      unitId,
    });
    const folioId = "550e8400-e29b-41d4-a716-446655443044";
    const folio = Folio.open({
      id: folioId,
      tenantId,
      bookingId,
      currency: "EUR",
    });
    await folioRepository.saveNew(folio);

    const cross = await folioRepository.findById(otherTenantId, folioId);
    expect(cross).toBeNull();
  });

  it("RLS isolates folio rows by tenant GUC", async () => {
    const bookingId = "550e8400-e29b-41d4-a716-446655443050";
    await seedBooking({
      holdId: "550e8400-e29b-41d4-a716-446655443051",
      quoteId: "550e8400-e29b-41d4-a716-446655443052",
      snapshotId: "550e8400-e29b-41d4-a716-446655443053",
      bookingId,
      tenantId,
      propertyId,
      unitId,
    });
    const folioId = "550e8400-e29b-41d4-a716-446655443054";
    await folioRepository.saveNew(
      Folio.open({
        id: folioId,
        tenantId,
        bookingId,
        currency: "EUR",
      }),
    );

    await setTenantContext(prisma, otherTenantId);
    const rows = await prisma.folio.findMany({ where: { id: folioId } });
    expect(rows).toHaveLength(0);

    await setTenantContext(prisma, tenantId);
    const own = await prisma.folio.findMany({ where: { id: folioId } });
    expect(own).toHaveLength(1);

    await clearTenantContext(prisma);
  });

  it("concurrent primary opens: second save reports already_exists", async () => {
    const bookingId = "550e8400-e29b-41d4-a716-446655443060";
    await seedBooking({
      holdId: "550e8400-e29b-41d4-a716-446655443061",
      quoteId: "550e8400-e29b-41d4-a716-446655443062",
      snapshotId: "550e8400-e29b-41d4-a716-446655443063",
      bookingId,
      tenantId,
      propertyId,
      unitId,
    });

    const a = Folio.open({
      id: randomUUID(),
      tenantId,
      bookingId,
      currency: "EUR",
      folioKey: "primary",
    });
    const b = Folio.open({
      id: randomUUID(),
      tenantId,
      bookingId,
      currency: "EUR",
      folioKey: "primary",
    });

    const [r1, r2] = await Promise.all([
      folioRepository.saveNew(a),
      folioRepository.saveNew(b),
    ]);
    const outcomes = [r1, r2].sort();
    expect(outcomes).toEqual(["already_exists", "created"]);

    const list = await folioRepository.findByBooking(tenantId, bookingId);
    expect(list).toHaveLength(1);
  });
});

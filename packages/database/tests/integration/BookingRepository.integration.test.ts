import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  Booking,
  Hold,
  Quote,
  PricingCalculator,
} from "@hcp/domain";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import {
  truncateIntegrationTables,
  countOutboxForAggregate,
  prisma,
} from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

runIntegration("BookingRepository integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const calendarRepository = new PrismaCalendarBlockRepository();
  const ratePlanRepository = new PrismaRatePlanRepository();

  const tenantId = "550e8400-e29b-41d4-a716-446655442040";
  const propertyId = "550e8400-e29b-41d4-a716-446655442041";
  const unitId = "550e8400-e29b-41d4-a716-446655442042";

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  async function createQuotePair() {
    const holdId = "550e8400-e29b-41d4-a716-446655442043";
    const quoteId = "550e8400-e29b-41d4-a716-446655442044";
    const snapshotId = "550e8400-e29b-41d4-a716-446655442045";

    const hold = Hold.create({
      id: holdId,
      tenantId,
      unitId,
      propertyId,
      checkIn: "2027-01-05",
      checkOut: "2027-01-08",
      guestCount: 2,
    });
    await holdRepository.save(hold);

    const ratePlan = (await ratePlanRepository.findByUnitId(unitId, tenantId))!;
    const pricing = new PricingCalculator().calculate(
      ratePlan,
      hold.stayPeriod,
      new Date("2026-06-01T12:00:00.000Z"),
    );

    const quote = Quote.create({
      id: quoteId,
      snapshotId,
      hold,
      pricing,
      propertyTimezone: "Europe/Athens",
    });
    await quoteRepository.save(quote);

    return { hold, quote };
  }

  it("creates booking with booking calendar block and outbox event", async () => {
    const bookingId = "550e8400-e29b-41d4-a716-446655442046";
    const { hold, quote } = await createQuotePair();

    const booking = Booking.create({
      id: bookingId,
      hold,
      quote,
      guest: { name: "Guest Test", email: "guest@test.com", phone: null },
      confirmationMode: "manual",
    });

    await holdRepository.save(hold);
    await bookingRepository.save(booking);

    const loaded = await bookingRepository.findById(bookingId, tenantId);
    expect(loaded?.status).toBe("pending");
    expect(loaded?.quoteId).toBe(quote.id);

    const blocks = await calendarRepository.findActiveBlocks(unitId, tenantId);
    expect(blocks.some((block) => block.blockType === "booking")).toBe(true);

    expect(await countOutboxForAggregate(bookingId)).toBe(1);
  });

  it("persists booking confirmation with outbox event", async () => {
    const bookingId = "550e8400-e29b-41d4-a716-446655442047";
    const { hold, quote } = await createQuotePair();

    const booking = Booking.create({
      id: bookingId,
      hold,
      quote,
      guest: { name: "Guest Confirm", email: "confirm@test.com", phone: null },
      confirmationMode: "manual",
    });

    await holdRepository.save(hold);
    await bookingRepository.save(booking);

    booking.confirm();
    await bookingRepository.save(booking);

    const loaded = await bookingRepository.findById(bookingId, tenantId);
    expect(loaded?.status).toBe("confirmed");
    expect(await countOutboxForAggregate(bookingId)).toBe(2);
  });
});

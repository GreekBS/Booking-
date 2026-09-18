import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Hold, Quote, PricingCalculator } from "@hcp/domain";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import {
  truncateIntegrationTables,
  countOutboxForAggregate,
  prisma,
} from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";


runIntegration("QuoteRepository integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const ratePlanRepository = new PrismaRatePlanRepository();

  const tenantId = "550e8400-e29b-41d4-a716-446655442030";
  const propertyId = "550e8400-e29b-41d4-a716-446655442031";
  const unitId = "550e8400-e29b-41d4-a716-446655442032";

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("persists immutable quote snapshot and outbox event", async () => {
    const holdId = "550e8400-e29b-41d4-a716-446655442033";
    const quoteId = "550e8400-e29b-41d4-a716-446655442034";
    const snapshotId = "550e8400-e29b-41d4-a716-446655442035";

    const hold = Hold.create({
      id: holdId,
      tenantId,
      unitId,
      propertyId,
      checkIn: "2026-12-01",
      checkOut: "2026-12-04",
      guestCount: 2,
    });
    await holdRepository.save(hold);

    const ratePlan = await ratePlanRepository.findByUnitId(unitId, tenantId);
    expect(ratePlan).not.toBeNull();

    const pricing = new PricingCalculator().calculate(
      ratePlan!,
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

    const loaded = await quoteRepository.findById(quoteId, tenantId);
    expect(loaded?.snapshot.totalAmount).toBe(quote.snapshot.totalAmount);
    expect(loaded?.snapshot.checkIn).toBe("2026-12-01");

    const row = await prisma.quote.findUnique({ where: { id: quoteId } });
    expect(row?.snapshot).toBeTruthy();

    expect(await countOutboxForAggregate(quoteId)).toBe(1);
  });

  it("does not update an existing quote row", async () => {
    const holdId = "550e8400-e29b-41d4-a716-446655442036";
    const quoteId = "550e8400-e29b-41d4-a716-446655442037";
    const snapshotId = "550e8400-e29b-41d4-a716-446655442038";

    const hold = Hold.create({
      id: holdId,
      tenantId,
      unitId,
      propertyId,
      checkIn: "2026-12-10",
      checkOut: "2026-12-13",
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
    await quoteRepository.save(quote);

    expect(await countOutboxForAggregate(quoteId)).toBe(1);
  });
});

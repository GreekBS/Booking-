import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { Hold, Quote, Money, type PricingResult } from "@hcp/domain";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaCommerceFlowRepository } from "../../src/repositories/commerce/CommerceFlowRepository";
import { withTenantTransaction } from "../../src/client";
import { truncateIntegrationTables } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";

runIntegration("Direct Booking Phase 2A1 Hold persistence", () => {
  const tenantId = "770e8400-e29b-41d4-a716-446655442030";
  const propertyId = "770e8400-e29b-41d4-a716-446655442031";
  const unitId = "770e8400-e29b-41d4-a716-446655442032";

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
  });

  it("saveHoldAndQuote creates active hold block + quote without booking/guest", async () => {
    const holdId = randomUUID();
    const hold = Hold.create({
      id: holdId,
      tenantId,
      unitId,
      propertyId,
      checkIn: "2026-11-10",
      checkOut: "2026-11-13",
      guestCount: 2,
      ttlSeconds: 120,
      sessionRef: `dbk-test-${holdId.slice(0, 8)}`,
    });

    const pricing: PricingResult = {
      currency: "EUR",
      subtotal: Money.create("450.0000", "EUR"),
      losDiscountAmount: Money.create("0.0000", "EUR"),
      total: Money.create("450.0000", "EUR"),
      lineItems: [
        {
          date: "2026-11-10",
          baseAmount: "150.0000",
          adjustedAmount: "150.0000",
          currency: "EUR",
        },
        {
          date: "2026-11-11",
          baseAmount: "150.0000",
          adjustedAmount: "150.0000",
          currency: "EUR",
        },
        {
          date: "2026-11-12",
          baseAmount: "150.0000",
          adjustedAmount: "150.0000",
          currency: "EUR",
        },
      ],
      quotedAt: new Date(),
    };

    const quote = Quote.create({
      id: randomUUID(),
      snapshotId: randomUUID(),
      hold,
      pricing,
      propertyTimezone: "Europe/Athens",
    });

    const flow = new PrismaCommerceFlowRepository(new PrismaOutboxRepository());
    await flow.saveHoldAndQuote(hold, quote);

    const persisted = await withTenantTransaction(tenantId, async (tx) => {
      const h = await tx.bookingHold.findFirst({ where: { id: holdId } });
      const block = await tx.unitCalendarBlock.findFirst({
        where: { sourceId: holdId, blockType: "hold" },
      });
      const q = await tx.quote.findFirst({ where: { holdId } });
      const bookings = await tx.booking.count({ where: { holdId } });
      const guests = await tx.guest.count({ where: { tenantId } });
      return { h, block, q, bookings, guests };
    });

    expect(persisted.h?.status).toBe("active");
    expect(persisted.block?.status).toBe("active");
    expect(persisted.block?.expiresAt?.getTime()).toBe(
      persisted.h!.expiresAt.getTime(),
    );
    expect(String(persisted.q?.totalAmount)).toMatch(/450/);
    expect(persisted.bookings).toBe(0);
    expect(persisted.guests).toBe(0);
  });
});

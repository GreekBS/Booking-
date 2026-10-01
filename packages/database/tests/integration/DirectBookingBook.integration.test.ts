import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  Hold,
  Quote,
  Booking,
  Money,
  CancelBookingUseCase,
  PermissionChecker,
  type PricingResult,
} from "@hcp/domain";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaCommerceFlowRepository } from "../../src/repositories/commerce/CommerceFlowRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaGuestRepository } from "../../src/repositories/guests/GuestRepository";
import { ResolveOrCreateGuest } from "@hcp/domain";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import { withTenantTransaction } from "../../src/client";
import { truncateIntegrationTables } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";

runIntegration("Direct Booking Phase 2A2 book conversion", () => {
  const tenantId = "770e8400-e29b-41d4-a716-446655442030";
  const propertyId = "770e8400-e29b-41d4-a716-446655442031";
  const unitId = "770e8400-e29b-41d4-a716-446655442032";
  const ids = new UuidIdGenerator();
  const outbox = new PrismaOutboxRepository();
  const flow = new PrismaCommerceFlowRepository(outbox);
  const bookings = new PrismaBookingRepository(outbox);
  const guests = new PrismaGuestRepository();
  const resolveGuest = new ResolveOrCreateGuest(guests, ids, new PermissionChecker());
  const cancel = new CancelBookingUseCase(
    bookings,
    new PermissionChecker(),
    { append: async () => undefined } as never,
    null,
  );

  const actor = {
    userId: "direct-booking:test",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
  });

  it("saveHoldAndBooking converts hold block to booking block with no Payment/Folio", async () => {
    const holdId = randomUUID();
    const hold = Hold.create({
      id: holdId,
      tenantId,
      unitId,
      propertyId,
      checkIn: "2026-11-20",
      checkOut: "2026-11-23",
      guestCount: 2,
      ttlSeconds: 600,
      sessionRef: `dbk-book-${holdId.slice(0, 8)}`,
    });

    const pricing: PricingResult = {
      currency: "EUR",
      subtotal: Money.create("450.0000", "EUR"),
      losDiscountAmount: Money.create("0.0000", "EUR"),
      total: Money.create("450.0000", "EUR"),
      lineItems: [
        {
          date: "2026-11-20",
          baseAmount: "150.0000",
          adjustedAmount: "150.0000",
          currency: "EUR",
        },
        {
          date: "2026-11-21",
          baseAmount: "150.0000",
          adjustedAmount: "150.0000",
          currency: "EUR",
        },
        {
          date: "2026-11-22",
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

    await flow.saveHoldAndQuote(hold, quote);

    const guestResult = await resolveGuest.executeForBookingCreate(
      {
        tenantId,
        contact: {
          displayName: "Maria Papadopoulos",
          firstName: "Maria",
          lastName: "Papadopoulos",
          email: "maria.2a2@example.com",
          phone: "+306900000022",
          country: "GR",
        },
      },
      actor,
    );
    expect(guestResult.isSuccess).toBe(true);
    const guest = guestResult.getValue().guest;

    const booking = Booking.create({
      id: randomUUID(),
      hold,
      quote,
      guest: {
        name: "Maria Papadopoulos",
        email: "maria.2a2@example.com",
        phone: "+306900000022",
      },
      guestId: guest.id,
      confirmationMode: "manual",
    });
    expect(booking.status).toBe("pending");
    expect(hold.status).toBe("converted");

    await flow.saveHoldAndBooking(hold, booking);

    const persisted = await withTenantTransaction(tenantId, async (tx) => {
      const h = await tx.bookingHold.findFirst({ where: { id: holdId } });
      const holdBlock = await tx.unitCalendarBlock.findFirst({
        where: { sourceId: holdId, blockType: "hold" },
      });
      const bookingBlock = await tx.unitCalendarBlock.findFirst({
        where: { sourceId: booking.id, blockType: "booking" },
      });
      const b = await tx.booking.findFirst({ where: { id: booking.id } });
      const g = await tx.guest.findFirst({ where: { id: guest.id } });
      const payments = await tx.payment.count({ where: { bookingId: booking.id } });
      const folios = await tx.folio.count({ where: { bookingId: booking.id } });
      const paymentRecords = await tx.paymentRecord.count({
        where: { bookingId: booking.id },
      });
      return { h, holdBlock, bookingBlock, b, g, payments, folios, paymentRecords };
    });

    expect(persisted.h?.status).toBe("converted");
    expect(persisted.holdBlock?.status).toBe("released");
    expect(persisted.bookingBlock?.status).toBe("active");
    expect(persisted.b?.status).toBe("pending");
    expect(String(persisted.b?.totalAmount)).toMatch(/450/);
    expect(persisted.b?.currency).toBe("EUR");
    expect(persisted.g?.firstName).toBe("Maria");
    expect(persisted.g?.lastName).toBe("Papadopoulos");
    expect(persisted.g?.country).toBe("GR");
    expect(persisted.payments).toBe(0);
    expect(persisted.folios).toBe(0);
    expect(persisted.paymentRecords).toBe(0);

    // PMS read path
    const listed = await bookings.findByUnit(unitId, tenantId, {
      from: "2026-11-01",
      to: "2026-12-01",
    });
    expect(listed.some((row) => row.id === booking.id)).toBe(true);

    // Cancel releases inventory
    const cancelResult = await cancel.execute(
      { tenantId, bookingId: booking.id },
      actor,
    );
    expect(cancelResult.isSuccess).toBe(true);

    const afterCancel = await withTenantTransaction(tenantId, async (tx) => {
      const b = await tx.booking.findFirst({ where: { id: booking.id } });
      const bookingBlock = await tx.unitCalendarBlock.findFirst({
        where: { sourceId: booking.id, blockType: "booking" },
      });
      return { b, bookingBlock };
    });
    expect(afterCancel.b?.status).toBe("cancelled");
    expect(afterCancel.bookingBlock?.status).toBe("cancelled");
  });
});

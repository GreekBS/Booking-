import { describe, it, expect, beforeEach } from "vitest";
import {
  GetDirectBookingCalendarUseCase,
  CreateDirectBookingIntegrationUseCase,
  PermissionChecker,
} from "@hcp/domain";
import {
  PrismaDirectBookingIntegrationRepository,
  generateDirectBookingPublicKey,
} from "../../src/repositories/direct-booking/DirectBookingIntegrationRepository";
import { PrismaDirectBookingCatalogAdapter } from "../../src/adapters/DirectBookingCatalogAdapter";
import { PrismaPropertyRepository } from "../../src/repositories/PropertyRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaAvailabilityRulesRepository } from "../../src/repositories/commerce/AvailabilityRulesRepository";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import { hashToken } from "../../src/repositories/IdentityRepositories";
import { withTenantTransaction } from "../../src/client";
import { truncateIntegrationTables } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";

runIntegration("Direct Booking Phase 1B calendar integration", () => {
  const tenantId = "770e8400-e29b-41d4-a716-446655442030";
  const propertyId = "770e8400-e29b-41d4-a716-446655442031";
  const unitId = "770e8400-e29b-41d4-a716-446655442032";

  const outbox = new PrismaOutboxRepository();
  const idGenerator = new UuidIdGenerator();
  const integrations = new PrismaDirectBookingIntegrationRepository();
  const catalog = new PrismaDirectBookingCatalogAdapter();
  const permissionChecker = new PermissionChecker();
  const properties = new PrismaPropertyRepository(outbox);

  const calendarUseCase = new GetDirectBookingCalendarUseCase(
    catalog,
    new PrismaCalendarBlockRepository(),
    new PrismaAvailabilityRulesRepository(),
    new PrismaRatePlanRepository(),
    new TimezoneService(),
  );

  const createUseCase = new CreateDirectBookingIntegrationUseCase(
    integrations,
    properties,
    permissionChecker,
    idGenerator,
    (env) => generateDirectBookingPublicKey(env),
  );

  const adminActor = {
    userId: "user-admin",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.unitAvailabilityRule.upsert({
        where: { unitId },
        create: {
          id: idGenerator.generate(),
          tenantId,
          unitId,
          minNights: 3,
          maxNights: 30,
        },
        update: { minNights: 3, maxNights: 30 },
      });
    });
  });

  it("returns authoritative nightly prices and blocks occupied nights without side effects", async () => {
    const created = await createUseCase.execute(
      {
        tenantId,
        propertyId,
        unitId,
        environment: "test",
        allowedOrigins: ["https://example.test"],
        status: "active",
      },
      adminActor,
    );
    expect(created.isSuccess).toBe(true);
    const lookup = await integrations.findByPublicKeyHash(
      hashToken(created.getValue().publicKey),
    );
    expect(lookup).not.toBeNull();

    await withTenantTransaction(tenantId, async (tx) => {
      await tx.unitCalendarBlock.create({
        data: {
          id: idGenerator.generate(),
          tenantId,
          unitId,
          propertyId,
          blockType: "manual",
          status: "active",
          checkIn: new Date("2026-12-10T00:00:00.000Z"),
          checkOut: new Date("2026-12-12T00:00:00.000Z"),
          reason: "owner",
        },
      });
    });

    const result = await calendarUseCase.execute(lookup!, {
      from: "2026-12-10",
      to: "2026-12-14",
      guestCount: 2,
    });
    expect(result.isSuccess).toBe(true);
    const dto = result.getValue();
    expect(dto.minNights).toBe(3);
    expect(dto.currency).toBe("EUR");
    const byDate = Object.fromEntries(dto.days.map((d) => [d.date, d]));
    expect(byDate["2026-12-10"]?.available).toBe(false);
    expect(byDate["2026-12-10"]?.nightlyPrice).toBeNull();
    expect(byDate["2026-12-12"]?.available).toBe(true);
    expect(byDate["2026-12-12"]?.nightlyPrice).toBe("100.0000"); // seed fixture base rate
    expect(JSON.stringify(dto)).not.toContain(tenantId);

    const side = await withTenantTransaction(tenantId, async (tx) => ({
      holds: await tx.bookingHold.count({ where: { tenantId } }),
      quotes: await tx.quote.count({ where: { tenantId } }),
      bookings: await tx.booking.count({ where: { tenantId } }),
      guests: await tx.guest.count({ where: { tenantId } }),
    }));
    expect(side).toEqual({ holds: 0, quotes: 0, bookings: 0, guests: 0 });
  });

  it("fails closed for draft integration", async () => {
    const created = await createUseCase.execute(
      {
        tenantId,
        propertyId,
        unitId,
        environment: "test",
        allowedOrigins: ["https://example.test"],
        status: "draft",
      },
      adminActor,
    );
    const lookup = await integrations.findByPublicKeyHash(
      hashToken(created.getValue().publicKey),
    );
    const result = await calendarUseCase.execute(lookup!, {
      from: "2026-12-10",
      to: "2026-12-13",
      guestCount: 2,
    });
    expect(result.isFailure).toBe(true);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  CreateDirectBookingIntegrationUseCase,
  GetDirectBookingPublicConfigUseCase,
  CheckDirectBookingAvailabilityUseCase,
  QuoteDirectBookingStayUseCase,
  PermissionChecker,
  ReservationOrchestrator,
} from "@hcp/domain";
import {
  PrismaDirectBookingIntegrationRepository,
  generateDirectBookingPublicKey,
} from "../../src/repositories/direct-booking/DirectBookingIntegrationRepository";
import { PrismaDirectBookingCatalogAdapter } from "../../src/adapters/DirectBookingCatalogAdapter";
import { PrismaPropertyRepository } from "../../src/repositories/PropertyRepository";
import { PrismaCatalogQueryAdapter } from "../../src/adapters/CatalogQueryAdapter";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaAvailabilityRulesRepository } from "../../src/repositories/commerce/AvailabilityRulesRepository";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import { hashToken } from "../../src/repositories/IdentityRepositories";
import { prisma, withTenantTransaction } from "../../src/client";
import { truncateIntegrationTables } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";

runIntegration("Direct Booking Phase 1 integration", () => {
  const tenantId = "660e8400-e29b-41d4-a716-446655442010";
  const propertyId = "660e8400-e29b-41d4-a716-446655442011";
  const unitId = "660e8400-e29b-41d4-a716-446655442012";
  const otherTenantId = "660e8400-e29b-41d4-a716-446655442020";

  const outbox = new PrismaOutboxRepository();
  const idGenerator = new UuidIdGenerator();
  const integrations = new PrismaDirectBookingIntegrationRepository();
  const catalog = new PrismaDirectBookingCatalogAdapter();
  const properties = new PrismaPropertyRepository(outbox);
  const permissionChecker = new PermissionChecker();
  const orchestrator = new ReservationOrchestrator(
    new PrismaCatalogQueryAdapter(),
    new PrismaCalendarBlockRepository(),
    new PrismaAvailabilityRulesRepository(),
    new PrismaRatePlanRepository(),
    new TimezoneService(),
    idGenerator,
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
    await seedCommerceFixture({
      tenantId,
      propertyId,
      unitId,
    });
  });

  it("provisions integration and resolves public config for active inventory", async () => {
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
    const { publicKey, integration } = created.getValue();

    const lookup = await integrations.findByPublicKeyHash(hashToken(publicKey));
    expect(lookup?.id).toBe(integration.id);
    expect(lookup?.tenantId).toBe(tenantId);
    expect(lookup?.propertyId).toBe(propertyId);

    const config = await new GetDirectBookingPublicConfigUseCase(
      integrations,
      catalog,
    ).execute(lookup!);
    expect(config.isSuccess).toBe(true);
    expect(config.getValue().bookable).toBe(true);
    expect(config.getValue().property.type).toBe("villa");
  });

  it("fails closed for draft property even with active integration", async () => {
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.property.update({
        where: { id: propertyId },
        data: { status: "draft" },
      });
    });

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
    const lookup = await integrations.findByPublicKeyHash(
      hashToken(created.getValue().publicKey),
    );

    const availability = await new CheckDirectBookingAvailabilityUseCase(
      catalog,
      orchestrator,
    ).execute(lookup!, {
      checkIn: "2026-11-01",
      checkOut: "2026-11-03",
      guestCount: 2,
    });
    expect(availability.isFailure).toBe(true);

    const quote = await new QuoteDirectBookingStayUseCase(catalog, orchestrator).execute(
      lookup!,
      { checkIn: "2026-11-01", checkOut: "2026-11-03", guestCount: 2 },
    );
    expect(quote.isFailure).toBe(true);
  });

  it("disabled integration is not publicly resolvable", async () => {
    const created = await createUseCase.execute(
      {
        tenantId,
        propertyId,
        unitId,
        environment: "test",
        allowedOrigins: ["https://example.test"],
        status: "disabled",
      },
      adminActor,
    );
    const lookup = await integrations.findByPublicKeyHash(
      hashToken(created.getValue().publicKey),
    );
    expect(lookup).toBeNull();
  });

  it("availability respects calendar blocks and quote does not create bookings/holds/guests", async () => {
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
          checkIn: new Date("2026-11-10T00:00:00.000Z"),
          checkOut: new Date("2026-11-12T00:00:00.000Z"),
          reason: "owner block",
        },
      });
    });

    const blocked = await new CheckDirectBookingAvailabilityUseCase(
      catalog,
      orchestrator,
    ).execute(lookup!, {
      checkIn: "2026-11-10",
      checkOut: "2026-11-12",
      guestCount: 2,
    });
    if (blocked.isFailure) {
      throw blocked.getError();
    }
    expect(blocked.getValue().available).toBe(false);

    const open = await new QuoteDirectBookingStayUseCase(catalog, orchestrator).execute(
      lookup!,
      { checkIn: "2026-12-01", checkOut: "2026-12-03", guestCount: 2 },
    );
    if (open.isFailure) {
      throw open.getError();
    }
    expect(open.getValue().currency).toBe("EUR");
    expect(Number(open.getValue().total)).toBeGreaterThan(0);

    const [holds, quotes, bookings, guests] = await withTenantTransaction(
      tenantId,
      async (tx) =>
        Promise.all([
          tx.bookingHold.count({ where: { tenantId } }),
          tx.quote.count({ where: { tenantId } }),
          tx.booking.count({ where: { tenantId } }),
          tx.guest.count({ where: { tenantId } }),
        ]),
    );
    expect(holds).toBe(0);
    expect(quotes).toBe(0);
    expect(bookings).toBe(0);
    expect(guests).toBe(0);

    void otherTenantId;
  });
});

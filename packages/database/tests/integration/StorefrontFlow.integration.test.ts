import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  CheckAvailabilityUseCase,
  CreateHoldUseCase,
  CreateQuoteUseCase,
  CreateBookingUseCase,
  GetPublicPropertyBySlugUseCase,
  PermissionChecker,
  ReservationOrchestrator,
  createStorefrontActor,
} from "@hcp/domain";
import { PrismaPublishableKeyRepository } from "../../src/repositories/storefront/PublishableKeyRepository";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaAvailabilityRulesRepository } from "../../src/repositories/commerce/AvailabilityRulesRepository";
import { PrismaCommerceFlowRepository } from "../../src/repositories/commerce/CommerceFlowRepository";
import { PrismaCatalogQueryAdapter } from "../../src/adapters/CatalogQueryAdapter";
import { PrismaStorefrontCatalogAdapter } from "../../src/adapters/StorefrontCatalogAdapter";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaAuditLogRepository } from "../../src/repositories/AuditLogRepository";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import { hashToken } from "../../src/repositories/IdentityRepositories";
import {
  truncateIntegrationTables,
  prisma,
} from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import {
  STOREFRONT_TEST_PUBLISHABLE_KEY,
  seedStorefrontKey,
} from "./storefrontFixtures";
import { runIntegration } from "./integrationGate";


runIntegration("Storefront public flow integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const publishableKeyRepository = new PrismaPublishableKeyRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const calendarRepository = new PrismaCalendarBlockRepository();
  const ratePlanRepository = new PrismaRatePlanRepository();
  const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
  const commerceFlowRepository = new PrismaCommerceFlowRepository(outboxRepository);
  const catalogQueryAdapter = new PrismaCatalogQueryAdapter();
  const storefrontCatalogAdapter = new PrismaStorefrontCatalogAdapter();
  const timezoneService = new TimezoneService();
  const permissionChecker = new PermissionChecker();
  const auditLogRepository = new PrismaAuditLogRepository();
  const idGenerator = new UuidIdGenerator();

  const tenantId = "550e8400-e29b-41d4-a716-446655442060";
  const propertyId = "550e8400-e29b-41d4-a716-446655442061";
  const unitId = "550e8400-e29b-41d4-a716-446655442062";

  const getPublicPropertyBySlugUseCase = new GetPublicPropertyBySlugUseCase(
    storefrontCatalogAdapter,
  );
  const reservationOrchestrator = new ReservationOrchestrator(
    catalogQueryAdapter,
    calendarRepository,
    availabilityRulesRepository,
    ratePlanRepository,
    timezoneService,
    idGenerator,
  );
  const checkAvailabilityUseCase = new CheckAvailabilityUseCase(
    catalogQueryAdapter,
    reservationOrchestrator,
    permissionChecker,
  );
  const createHoldUseCase = new CreateHoldUseCase(
    holdRepository,
    reservationOrchestrator,
    permissionChecker,
    idGenerator,
  );
  const createQuoteUseCase = new CreateQuoteUseCase(
    catalogQueryAdapter,
    holdRepository,
    quoteRepository,
    reservationOrchestrator,
    permissionChecker,
    idGenerator,
  );
  const createBookingUseCase = new CreateBookingUseCase(
    holdRepository,
    quoteRepository,
    commerceFlowRepository,
    permissionChecker,
    auditLogRepository,
    idGenerator,
  );

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
    await seedStorefrontKey({ tenantId, propertyId, unitId });
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("resolves publishable key to tenant", async () => {
    const key = await publishableKeyRepository.findByKeyHash(
      hashToken(STOREFRONT_TEST_PUBLISHABLE_KEY),
    );
    expect(key?.tenantId).toBe(tenantId);
  });

  it("loads published property by slug for storefront", async () => {
    const property = await prisma.property.findFirst({ where: { id: propertyId } });
    const result = await getPublicPropertyBySlugUseCase.execute(
      tenantId,
      property!.slug,
    );
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().units).toHaveLength(1);
  });

  it("completes public hold → quote → booking via storefront actor", async () => {
    const actor = createStorefrontActor(tenantId);

    const holdResult = await createHoldUseCase.execute(
      {
        tenantId,
        unitId,
        checkIn: "2027-04-01",
        checkOut: "2027-04-05",
        guestCount: 2,
        sessionRef: "storefront-idem-hold-1",
      },
      actor,
    );
    expect(holdResult.isSuccess).toBe(true);

    const quoteResult = await createQuoteUseCase.execute(
      { tenantId, holdId: holdResult.getValue().id },
      actor,
    );
    expect(quoteResult.isSuccess).toBe(true);

    const bookingResult = await createBookingUseCase.execute(
      {
        tenantId,
        quoteId: quoteResult.getValue().id,
        guest: { name: "Public Guest", email: "guest@storefront.test", phone: null },
      },
      actor,
    );
    expect(bookingResult.isSuccess).toBe(true);

    const availability = await checkAvailabilityUseCase.execute(
      {
        tenantId,
        unitId,
        checkIn: "2027-04-01",
        checkOut: "2027-04-05",
        guestCount: 2,
      },
      actor,
    );
    expect(availability.isSuccess).toBe(true);
    expect(availability.getValue().available).toBe(false);
  });
});

/**
 * CRM-2 PostgreSQL integration: Guest linkage on booking create,
 * atomicity, concurrency, snapshot integrity.
 */
import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  CreateHoldUseCase,
  CreateQuoteUseCase,
  CreateBookingUseCase,
  PermissionChecker,
  ReservationOrchestrator,
  ResolveOrCreateGuest,
  ConflictError,
  type ActorContext,
} from "@hcp/domain";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaQuoteRepository } from "../../src/repositories/commerce/QuoteRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaRatePlanRepository } from "../../src/repositories/commerce/RatePlanRepository";
import { PrismaAvailabilityRulesRepository } from "../../src/repositories/commerce/AvailabilityRulesRepository";
import { PrismaCommerceFlowRepository } from "../../src/repositories/commerce/CommerceFlowRepository";
import { PrismaGuestRepository } from "../../src/repositories/guests/GuestRepository";
import { PrismaCatalogQueryAdapter } from "../../src/adapters/CatalogQueryAdapter";
import { TimezoneService } from "../../src/adapters/TimezoneService";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaAuditLogRepository } from "../../src/repositories/AuditLogRepository";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import { withTenantTransaction, prisma, truncateIntegrationTables } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";

runIntegration("CRM-2 Guest booking integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const calendarRepository = new PrismaCalendarBlockRepository();
  const ratePlanRepository = new PrismaRatePlanRepository();
  const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
  const commerceFlowRepository = new PrismaCommerceFlowRepository(outboxRepository);
  const catalogQueryAdapter = new PrismaCatalogQueryAdapter();
  const timezoneService = new TimezoneService();
  const permissionChecker = new PermissionChecker();
  const auditLogRepository = new PrismaAuditLogRepository();
  const idGenerator = new UuidIdGenerator();
  const guestRepository = new PrismaGuestRepository();
  const resolveOrCreateGuest = new ResolveOrCreateGuest(
    guestRepository,
    idGenerator,
    permissionChecker,
  );

  const adminActor: ActorContext = {
    userId: "550e8400-e29b-41d4-a716-446655442199",
    role: "admin",
    propertyIds: null,
    isSuperAdmin: false,
  };

  const storefrontActor: ActorContext = {
    userId: "storefront:550e8400-e29b-41d4-a716-446655442150",
    role: "admin",
    propertyIds: null,
    isSuperAdmin: false,
  };

  const tenantId = "550e8400-e29b-41d4-a716-446655442150";
  const propertyId = "550e8400-e29b-41d4-a716-446655442151";
  const unitId = "550e8400-e29b-41d4-a716-446655442152";

  const orchestrator = new ReservationOrchestrator(
    catalogQueryAdapter,
    calendarRepository,
    availabilityRulesRepository,
    ratePlanRepository,
    timezoneService,
    idGenerator,
  );

  const createHoldUseCase = new CreateHoldUseCase(
    holdRepository,
    orchestrator,
    permissionChecker,
    idGenerator,
  );
  const createQuoteUseCase = new CreateQuoteUseCase(
    catalogQueryAdapter,
    holdRepository,
    quoteRepository,
    orchestrator,
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
    resolveOrCreateGuest,
    guestRepository,
  );

  async function bookStay(
    dates: { checkIn: string; checkOut: string },
    guest: { name: string; email: string; phone: string | null },
    actor: ActorContext = adminActor,
    guestId?: string | null,
  ) {
    const holdResult = await createHoldUseCase.execute(
      {
        tenantId,
        unitId,
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
        guestCount: 2,
      },
      actor,
    );
    if (holdResult.isFailure) throw holdResult.getError();

    const quoteResult = await createQuoteUseCase.execute(
      { tenantId, holdId: holdResult.getValue().id },
      actor,
    );
    if (quoteResult.isFailure) throw quoteResult.getError();

    return createBookingUseCase.execute(
      {
        tenantId,
        quoteId: quoteResult.getValue().id,
        guest,
        confirmationMode: "manual",
        guestId,
      },
      actor,
    );
  }

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture(
      { tenantId, propertyId, unitId },
      { adminUserId: adminActor.userId },
    );
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("manual booking creates Guest and sets Booking.guestId", async () => {
    const email = `crm2-new-${randomUUID().slice(0, 8)}@demo.test`;
    const result = await bookStay(
      { checkIn: "2027-04-01", checkOut: "2027-04-05" },
      { name: "CRM2 New Human", email, phone: null },
    );
    expect(result.isSuccess).toBe(true);
    const booking = result.getValue();
    expect(booking.guestId).toBeTruthy();
    expect(booking.guest.email).toBe(email);

    const guest = await guestRepository.findById(tenantId, booking.guestId!);
    expect(guest?.displayName).toBe("CRM2 New Human");
    expect(guest?.email).toBe(email);
  });

  it("repeated strong identity matches same Guest", async () => {
    const email = `crm2-match-${randomUUID().slice(0, 8)}@demo.test`;
    const guest = { name: "CRM2 Repeat", email, phone: "+306900000001" };

    const first = await bookStay(
      { checkIn: "2027-05-01", checkOut: "2027-05-04" },
      guest,
    );
    expect(first.isSuccess).toBe(true);

    const second = await bookStay(
      { checkIn: "2027-06-01", checkOut: "2027-06-04" },
      guest,
    );
    expect(second.isSuccess).toBe(true);
    expect(second.getValue().guestId).toBe(first.getValue().guestId);
  });

  it("same email with conflicting name creates separate Guest", async () => {
    const email = `crm2-ambig-${randomUUID().slice(0, 8)}@demo.test`;
    const first = await bookStay(
      { checkIn: "2027-07-01", checkOut: "2027-07-04" },
      { name: "Alice Smith", email, phone: null },
    );
    expect(first.isSuccess).toBe(true);

    const second = await bookStay(
      { checkIn: "2027-08-01", checkOut: "2027-08-04" },
      { name: "Robert Jones", email, phone: null },
    );
    expect(second.isSuccess).toBe(true);
    expect(second.getValue().guestId).not.toBe(first.getValue().guestId);
  });

  it("placeholder email does not merge distinct OTA guests", async () => {
    const placeholder = "booking-com-guest@invalid.talos.local";
    const first = await bookStay(
      { checkIn: "2027-09-01", checkOut: "2027-09-04" },
      { name: "OTA One", email: placeholder, phone: null },
    );
    const second = await bookStay(
      { checkIn: "2027-10-01", checkOut: "2027-10-04" },
      { name: "OTA Two", email: placeholder, phone: null },
    );
    expect(first.isSuccess).toBe(true);
    expect(second.isSuccess).toBe(true);
    expect(first.getValue().guestId).not.toBe(second.getValue().guestId);
  });

  it("Guest profile update does not rewrite Booking snapshot", async () => {
    const email = `crm2-snap-${randomUUID().slice(0, 8)}@demo.test`;
    const result = await bookStay(
      { checkIn: "2027-11-01", checkOut: "2027-11-04" },
      { name: "Snap Guest", email, phone: "+306911111111" },
    );
    expect(result.isSuccess).toBe(true);
    const booking = result.getValue();
    const snapshot = { ...booking.guest };

    const guest = await guestRepository.findById(tenantId, booking.guestId!);
    expect(guest).toBeTruthy();
    guest!.updateProfile({
      displayName: "Updated CRM Name",
      email: `updated-${randomUUID().slice(0, 8)}@demo.test`,
      phone: "+306922222222",
    });
    await guestRepository.save(guest!);

    const reloaded = await bookingRepository.findById(booking.id, tenantId);
    expect(reloaded?.guest.name).toBe(snapshot.name);
    expect(reloaded?.guest.email).toBe(snapshot.email);
    expect(reloaded?.guest.phone).toBe(snapshot.phone);
    expect(reloaded?.guestId).toBe(booking.guestId);
  });

  it("rolls back Guest when booking persistence fails inside TX", async () => {
    const email = `crm2-rollback-${randomUUID().slice(0, 8)}@demo.test`;
    const guestCountBefore = await prisma.guest.count({ where: { tenantId } });

    await expect(
      withTenantTransaction(tenantId, async () => {
        const resolved = await resolveOrCreateGuest.executeForBookingCreate(
          {
            tenantId,
            contact: {
              displayName: "Rollback Guest",
              email,
              phone: null,
            },
          },
          adminActor,
        );
        expect(resolved.isSuccess).toBe(true);
        // Force abort after Guest write joined this TX
        throw new ConflictError("Dates no longer available");
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const guestCountAfter = await prisma.guest.count({ where: { tenantId } });
    expect(guestCountAfter).toBe(guestCountBefore);
    const orphan = await guestRepository.findActiveByEmailNormalized(
      tenantId,
      email.toLowerCase(),
    );
    expect(orphan).toHaveLength(0);
  });

  it("inventory conflict fails closed without orphan Guest", async () => {
    const emailA = `crm2-inv-a-${randomUUID().slice(0, 8)}@demo.test`;
    const emailB = `crm2-inv-b-${randomUUID().slice(0, 8)}@demo.test`;

    const first = await bookStay(
      { checkIn: "2028-01-10", checkOut: "2028-01-15" },
      { name: "Inventory A", email: emailA, phone: null },
    );
    expect(first.isSuccess).toBe(true);

    const guestsBefore = await prisma.guest.count({ where: { tenantId } });

    const overlap = await bookStay(
      { checkIn: "2028-01-12", checkOut: "2028-01-18" },
      { name: "Inventory B", email: emailB, phone: null },
    );
    expect(overlap.isFailure).toBe(true);

    const guestsAfter = await prisma.guest.count({ where: { tenantId } });
    expect(guestsAfter).toBe(guestsBefore);
    expect(
      await guestRepository.findActiveByEmailNormalized(tenantId, emailB.toLowerCase()),
    ).toHaveLength(0);
  });

  it("concurrent strong-identity booking creates share one Guest", async () => {
    const email = `crm2-conc-${randomUUID().slice(0, 8)}@demo.test`;
    const guest = { name: "Concurrent Same", email, phone: "+306933333333" };

    const [a, b] = await Promise.all([
      bookStay({ checkIn: "2028-02-01", checkOut: "2028-02-04" }, guest),
      bookStay({ checkIn: "2028-03-01", checkOut: "2028-03-04" }, guest),
    ]);

    expect(a.isSuccess).toBe(true);
    expect(b.isSuccess).toBe(true);
    expect(a.getValue().guestId).toBe(b.getValue().guestId);

    const matches = await guestRepository.findActiveByEmailNormalized(
      tenantId,
      email.toLowerCase(),
    );
    expect(matches).toHaveLength(1);
  });

  it("public/storefront actor cannot attach arbitrary guestId", async () => {
    const existing = await bookStay(
      { checkIn: "2028-04-01", checkOut: "2028-04-04" },
      {
        name: "Victim Guest",
        email: `crm2-victim-${randomUUID().slice(0, 8)}@demo.test`,
        phone: null,
      },
    );
    expect(existing.isSuccess).toBe(true);

    const hijack = await bookStay(
      { checkIn: "2028-05-01", checkOut: "2028-05-04" },
      {
        name: "Attacker",
        email: `crm2-attacker-${randomUUID().slice(0, 8)}@demo.test`,
        phone: null,
      },
      storefrontActor,
      existing.getValue().guestId,
    );
    expect(hijack.isFailure).toBe(true);
  });
});

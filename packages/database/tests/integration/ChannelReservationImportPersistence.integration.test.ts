import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  ChannelConnection,
  CredentialReference,
  ChannelListingMapping,
  ConflictError,
  ExternalReservationLink,
  PermissionChecker,
  PrepareReservationUseCase,
  ReservationOrchestrator,
  createChannelImportActor,
} from "@hcp/domain";
import {
  PrismaChannelConnectionRepository,
  PrismaChannelListingMappingRepository,
  PrismaChannelReservationImportPersistence,
  PrismaBookingRepository,
  PrismaCalendarBlockRepository,
  PrismaCatalogQueryAdapter,
  PrismaExternalReservationLinkRepository,
  PrismaHoldRepository,
  PrismaOutboxRepository,
  PrismaQuoteRepository,
  PrismaRatePlanRepository,
  PrismaAvailabilityRulesRepository,
  TimezoneService,
  UuidIdGenerator,
} from "../../src";
import {
  truncateIntegrationTables,
  countOutboxForAggregate,
  prisma,
} from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

runIntegration("ChannelReservationImportPersistence integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const quoteRepository = new PrismaQuoteRepository(outboxRepository);
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const linkRepository = new PrismaExternalReservationLinkRepository();
  const connectionRepository = new PrismaChannelConnectionRepository();
  const mappingRepository = new PrismaChannelListingMappingRepository();
  const calendarRepository = new PrismaCalendarBlockRepository();
  const ratePlanRepository = new PrismaRatePlanRepository();
  const availabilityRulesRepository = new PrismaAvailabilityRulesRepository();
  const catalogQueryAdapter = new PrismaCatalogQueryAdapter();
  const timezoneService = new TimezoneService();
  const permissionChecker = new PermissionChecker();
  const idGenerator = new UuidIdGenerator();
  const importPersistence = new PrismaChannelReservationImportPersistence(outboxRepository);

  const tenantId = "550e8400-e29b-41d4-a716-446655442070";
  const propertyId = "550e8400-e29b-41d4-a716-446655442071";
  const unitId = "550e8400-e29b-41d4-a716-446655442072";
  const connectionId = "550e8400-e29b-41d4-a716-446655442073";
  const mappingId = "550e8400-e29b-41d4-a716-446655442074";
  const linkId = "550e8400-e29b-41d4-a716-446655442075";
  const externalReservationId = "ota-atomic-001";
  const channelImportKey = `channel:${connectionId}:${externalReservationId}`;

  const reservationOrchestrator = new ReservationOrchestrator(
    catalogQueryAdapter,
    calendarRepository,
    availabilityRulesRepository,
    ratePlanRepository,
    timezoneService,
    idGenerator,
  );

  const prepareReservationUseCase = new PrepareReservationUseCase(
    catalogQueryAdapter,
    reservationOrchestrator,
    permissionChecker,
    idGenerator,
  );

  async function seedChannelMapping() {
    const connection = ChannelConnection.createDraft({
      id: connectionId,
      tenantId,
      provider: "booking_com",
      displayName: "Atomic Import Connection",
    });
    connection.attachCredentials(CredentialReference.create("cred_atomic_001"));
    connection.activate();
    await connectionRepository.create(connection);

    const mapping = ChannelListingMapping.createActive({
      id: mappingId,
      tenantId,
      connectionId,
      externalListingId: "listing-atomic-001",
      externalUnitId: "room-a",
      propertyId,
      unitId,
      syncDirection: "bidirectional",
    });
    await mappingRepository.save(mapping);
  }

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
    await seedChannelMapping();
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("atomically commits booking and external reservation link in one transaction", async () => {
    const prepared = await prepareReservationUseCase.prepare({
      reservation: {
        tenantId,
        propertyId,
        unitId,
        checkIn: "2027-06-01",
        checkOut: "2027-06-05",
        guestCount: 2,
        guest: { name: "Atomic Guest", email: "atomic@test.com", phone: null },
        source: "booking_com",
        externalReference: { source: "booking_com", externalId: externalReservationId },
      },
      profile: {
        confirmImmediately: true,
        idempotencyKey: channelImportKey,
        actor: createChannelImportActor(tenantId),
        writeAudit: false,
      },
    });

    expect(prepared.isSuccess).toBe(true);
    const { hold, quote, booking } = prepared.getValue();

    const link = ExternalReservationLink.createLink({
      id: linkId,
      tenantId,
      provider: "booking_com",
      connectionId,
      externalReservationId,
      bookingId: booking.id,
      mappingId,
      mappingVersion: 1,
    });

    await importPersistence.commitImport({ hold, quote, booking, link });

    const loadedBooking = await bookingRepository.findById(booking.id, tenantId);
    expect(loadedBooking?.status).toBe("confirmed");

    const loadedLink = await linkRepository.findByExternalReservation(
      tenantId,
      connectionId,
      externalReservationId,
    );
    expect(loadedLink?.bookingId).toBe(booking.id);
    expect(loadedLink?.mappingVersionAtImport).toBe(1);

    const persistedHold = await prisma.bookingHold.findFirst({
      where: { tenantId, id: hold.id, status: "converted" },
    });
    expect(persistedHold?.idempotencyKey).toBe(channelImportKey);

    const quoteCount = await prisma.quote.count({ where: { tenantId, id: quote.id } });
    expect(quoteCount).toBe(1);

    const blocks = await calendarRepository.findActiveBlocks(unitId, tenantId);
    expect(blocks.filter((block) => block.blockType === "booking")).toHaveLength(1);

    expect(await countOutboxForAggregate(booking.id)).toBeGreaterThan(0);
  });

  it("rolls back commerce writes when link insert violates uniqueness", async () => {
    const prepared = await prepareReservationUseCase.prepare({
      reservation: {
        tenantId,
        propertyId,
        unitId,
        checkIn: "2027-05-01",
        checkOut: "2027-05-04",
        guestCount: 2,
        guest: { name: "Rollback Guest", email: "rollback@test.com", phone: null },
        source: "booking_com",
      },
      profile: {
        confirmImmediately: true,
        idempotencyKey: `channel:${connectionId}:ota-atomic-dup`,
        actor: createChannelImportActor(tenantId),
        writeAudit: false,
      },
    });

    expect(prepared.isSuccess).toBe(true);
    const first = prepared.getValue();

    const firstLink = ExternalReservationLink.createLink({
      id: linkId,
      tenantId,
      provider: "booking_com",
      connectionId,
      externalReservationId: "ota-atomic-dup",
      bookingId: first.booking.id,
      mappingId,
      mappingVersion: 1,
    });
    await importPersistence.commitImport({
      hold: first.hold,
      quote: first.quote,
      booking: first.booking,
      link: firstLink,
    });

    const secondPrepared = await prepareReservationUseCase.prepare({
      reservation: {
        tenantId,
        propertyId,
        unitId,
        checkIn: "2027-05-15",
        checkOut: "2027-05-18",
        guestCount: 2,
        guest: { name: "Rollback Guest 2", email: "rollback2@test.com", phone: null },
        source: "booking_com",
      },
      profile: {
        confirmImmediately: true,
        idempotencyKey: `channel:${connectionId}:ota-atomic-dup-2`,
        actor: createChannelImportActor(tenantId),
        writeAudit: false,
      },
    });

    expect(secondPrepared.isSuccess).toBe(true);
    const second = secondPrepared.getValue();
    const duplicateLink = ExternalReservationLink.createLink({
      id: "550e8400-e29b-41d4-a716-446655442076",
      tenantId,
      provider: "booking_com",
      connectionId,
      externalReservationId: "ota-atomic-dup",
      bookingId: second.booking.id,
      mappingId,
      mappingVersion: 1,
    });

    await expect(
      importPersistence.commitImport({
        hold: second.hold,
        quote: second.quote,
        booking: second.booking,
        link: duplicateLink,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await bookingRepository.findById(second.booking.id, tenantId)).toBeNull();
    expect(await prisma.bookingHold.count({ where: { tenantId, id: second.hold.id } })).toBe(0);
    expect(await prisma.quote.count({ where: { tenantId, id: second.quote.id } })).toBe(0);
    expect(await linkRepository.findByExternalReservation(tenantId, connectionId, "ota-atomic-dup"))
      .not.toBeNull();
  });
});

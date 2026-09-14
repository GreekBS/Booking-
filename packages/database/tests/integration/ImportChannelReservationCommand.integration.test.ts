import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  ChannelConnection,
  ChannelImportKey,
  CredentialReference,
  ChannelListingMapping,
  ExternalReservationLink,
  ImportChannelReservationCommandUseCase,
  PermissionChecker,
  PrepareReservationUseCase,
  ReservationOrchestrator,
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

runIntegration("ImportChannelReservationCommand integration", () => {
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

  const tenantId = "550e8400-e29b-41d4-a716-446655442080";
  const propertyId = "550e8400-e29b-41d4-a716-446655442081";
  const unitId = "550e8400-e29b-41d4-a716-446655442082";
  const connectionId = "550e8400-e29b-41d4-a716-446655442083";
  const mappingId = "550e8400-e29b-41d4-a716-446655442084";
  const externalReservationId = "ota-command-001";

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

  const importCommandUseCase = new ImportChannelReservationCommandUseCase(
    linkRepository,
    mappingRepository,
    prepareReservationUseCase,
    importPersistence,
    idGenerator,
  );

  function buildCommand(mappingVersion = 1) {
    return {
      normalizedCommand: {
        tenantId,
        propertyId,
        unitId,
        checkIn: "2027-04-01",
        checkOut: "2027-04-05",
        guestCount: 2,
        guest: { name: "Command Guest", email: "command@test.com", phone: null },
        source: "booking_com" as const,
        externalReference: { source: "booking_com" as const, externalId: externalReservationId },
      },
      mappingContext: {
        mappingId,
        mappingVersion,
        propertyId,
        unitId,
        connectionId,
      },
      external: {
        provider: "booking_com" as const,
        connectionId,
        externalReservationId,
        externalRevision: "rev-001",
        lastExternalUpdateAt: "2027-04-01T10:00:00Z",
      },
    };
  }

  async function seedChannelMapping() {
    const connection = ChannelConnection.createDraft({
      id: connectionId,
      tenantId,
      provider: "booking_com",
      displayName: "Command Import Connection",
    });
    connection.attachCredentials(CredentialReference.create("cred_command_001"));
    connection.activate();
    await connectionRepository.create(connection);

    const mapping = ChannelListingMapping.createActive({
      id: mappingId,
      tenantId,
      connectionId,
      externalListingId: "listing-command-001",
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

  it("imports reservation and returns created booking with link", async () => {
    const result = await importCommandUseCase.execute(buildCommand());

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.outcome).toBe("created");
    if (value.outcome !== "created") {
      throw new Error("Expected created outcome");
    }

    expect(value.booking.status).toBe("confirmed");
    expect(value.link.bookingId).toBe(value.booking.id);
    expect(value.link.mappingVersionAtImport).toBe(1);

    const loadedBooking = await bookingRepository.findById(value.booking.id, tenantId);
    expect(loadedBooking?.status).toBe("confirmed");

    const loadedLink = await linkRepository.findByExternalReservation(
      tenantId,
      connectionId,
      externalReservationId,
    );
    expect(loadedLink?.bookingId).toBe(value.booking.id);

    const persistedHold = await prisma.bookingHold.findFirst({
      where: {
        tenantId,
        id: value.booking.holdId,
        status: "converted",
        idempotencyKey: ChannelImportKey.create(connectionId, externalReservationId).value,
      },
    });
    expect(persistedHold).not.toBeNull();

    const blocks = await calendarRepository.findActiveBlocks(unitId, tenantId);
    expect(blocks.filter((block) => block.blockType === "booking")).toHaveLength(1);
    expect(await countOutboxForAggregate(value.booking.id)).toBeGreaterThan(0);
  });

  it("returns duplicate link on second import without creating another booking", async () => {
    const first = await importCommandUseCase.execute(buildCommand());
    expect(first.isSuccess).toBe(true);
    const firstValue = first.getValue();
    if (firstValue.outcome !== "created") {
      throw new Error("Expected first import to create booking");
    }

    const second = await importCommandUseCase.execute(buildCommand());
    expect(second.isSuccess).toBe(true);
    const value = second.getValue();
    expect(value.outcome).toBe("duplicate");
    if (value.outcome !== "duplicate") {
      throw new Error("Expected duplicate outcome");
    }

    const bookingCount = await prisma.booking.count({ where: { tenantId } });
    expect(bookingCount).toBe(1);
    expect(value.link.bookingId).toBe(firstValue.booking.id);
  });

  it("rejects stale mapping version from dry-run context", async () => {
    const mapping = await mappingRepository.findById(tenantId, mappingId);
    mapping!.updateExternalMapping({
      externalListingId: "listing-command-002",
      externalUnitId: "room-a",
    });
    await mappingRepository.save(mapping!);

    const result = await importCommandUseCase.execute(buildCommand(1));

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toContain("re-run CM-3a import dry-run");
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
  });

  it("handles concurrent imports idempotently", async () => {
    const [first, second] = await Promise.all([
      importCommandUseCase.execute(buildCommand()),
      importCommandUseCase.execute({
        ...buildCommand(),
        normalizedCommand: {
          ...buildCommand().normalizedCommand,
          checkIn: "2027-05-01",
          checkOut: "2027-05-04",
          externalReference: {
            source: "booking_com",
            externalId: externalReservationId,
          },
        },
      }),
    ]);

    expect(first.isSuccess).toBe(true);
    expect(second.isSuccess).toBe(true);

    const outcomes = [first.getValue().outcome, second.getValue().outcome].sort();
    expect(outcomes).toEqual(["created", "duplicate"]);

    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
    expect(
      await prisma.externalReservationLink.count({
        where: { tenantId, connectionId, externalReservationId },
      }),
    ).toBe(1);
  });
});

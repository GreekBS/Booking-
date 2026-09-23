import { describe, it, expect, beforeEach, vi } from "vitest";
import { Booking } from "../../src/commerce/booking/domain/Booking";
import { Hold } from "../../src/commerce/booking/domain/Hold";
import { ConflictError, ValidationError } from "../../src/shared/errors/DomainError";
import { Result } from "../../src/shared/kernel/Result";
import { ExternalReservationLink } from "../../src/channels/domain/ExternalReservationLink";
import { ChannelImportKey } from "../../src/channels/domain/value-objects/ChannelImportKey";
import { InMemoryChannelListingMappingRepository } from "../../src/channels/repositories/InMemoryChannelListingMappingRepository";
import { InMemoryExternalReservationLinkRepository } from "../../src/channels/repositories/InMemoryExternalReservationLinkRepository";
import { ImportChannelReservationCommandUseCase } from "../../src/channels/application/ImportChannelReservationCommandUseCase";
import type { ImportChannelReservationCommand } from "../../src/channels/application/ImportChannelReservationCommandResult";
import { seedActiveMapping } from "./fixtures/channelImportSeed";
import { createQuoteForHold } from "../commerce/fixtures/commerceFixtures";
import { FAKE_CHANNEL_PROVIDER_ID } from "../../src/channels/simulation/FakeChannelReservationImportProvider";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440040";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440041";
const MAPPING_ID = "550e8400-e29b-41d4-a716-446655440042";
const LINK_ID = "550e8400-e29b-41d4-a716-446655440043";
const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440044";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440045";
const BOOKING_ID = "550e8400-e29b-41d4-a716-446655440050";
const EXTERNAL_RESERVATION_ID = "fake-res-001";

function buildNormalizedCommand() {
  return {
    tenantId: TENANT_ID,
    propertyId: PROPERTY_ID,
    unitId: UNIT_ID,
    checkIn: "2027-08-01",
    checkOut: "2027-08-05",
    guestCount: 2,
    guest: { name: "Guest", email: "guest@example.com", phone: null },
    source: FAKE_CHANNEL_PROVIDER_ID,
    externalReference: {
      source: FAKE_CHANNEL_PROVIDER_ID,
      externalId: EXTERNAL_RESERVATION_ID,
    },
  };
}

function buildMappingContext() {
  return {
    mappingId: MAPPING_ID,
    mappingVersion: 1,
    propertyId: PROPERTY_ID,
    unitId: UNIT_ID,
    connectionId: CONNECTION_ID,
  };
}

function buildCommand(
  overrides: Partial<ImportChannelReservationCommand> = {},
): ImportChannelReservationCommand {
  return {
    normalizedCommand: buildNormalizedCommand(),
    mappingContext: buildMappingContext(),
    external: {
      provider: FAKE_CHANNEL_PROVIDER_ID,
      connectionId: CONNECTION_ID,
      externalReservationId: EXTERNAL_RESERVATION_ID,
      externalRevision: "rev-1",
      lastExternalUpdateAt: "2027-08-01T10:00:00Z",
    },
    ...overrides,
  };
}

function buildPreparedBooking(bookingId = BOOKING_ID) {
  const hold = Hold.create({
    id: "hold-generated",
    tenantId: TENANT_ID,
    unitId: UNIT_ID,
    propertyId: PROPERTY_ID,
    checkIn: "2027-08-01",
    checkOut: "2027-08-05",
    guestCount: 2,
    sessionRef: ChannelImportKey.create(CONNECTION_ID, EXTERNAL_RESERVATION_ID).value,
  });
  const quote = createQuoteForHold(hold);
  const booking = Booking.create({
    id: bookingId,
    hold,
    quote,
    guest: { name: "Guest", email: "guest@example.com", phone: null },
    confirmationMode: "manual",
  });
  booking.confirm();
  return { hold, quote, booking };
}

describe("ImportChannelReservationCommandUseCase", () => {
  let mappingRepository: InMemoryChannelListingMappingRepository;
  let linkRepository: InMemoryExternalReservationLinkRepository;
  let prepareReservationUseCase: { prepare: ReturnType<typeof vi.fn> };
  let importPersistence: { commitImport: ReturnType<typeof vi.fn> };
  let idGenerator: { generate: ReturnType<typeof vi.fn> };
  let useCase: ImportChannelReservationCommandUseCase;

  beforeEach(async () => {
    mappingRepository = new InMemoryChannelListingMappingRepository();
    linkRepository = new InMemoryExternalReservationLinkRepository();
    prepareReservationUseCase = { prepare: vi.fn() };
    importPersistence = { commitImport: vi.fn().mockResolvedValue(undefined) };
    idGenerator = { generate: vi.fn().mockReturnValue(LINK_ID) };

    await seedActiveMapping(mappingRepository, {
      id: MAPPING_ID,
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      externalListingId: "fake-listing-100",
      externalUnitId: "fake-room-a",
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
    });

    useCase = new ImportChannelReservationCommandUseCase(
      linkRepository,
      mappingRepository,
      prepareReservationUseCase as never,
      importPersistence,
      idGenerator,
    );
  });

  it("creates booking and link on happy path", async () => {
    const prepared = buildPreparedBooking();
    prepareReservationUseCase.prepare.mockResolvedValue(Result.ok(prepared));

    const result = await useCase.execute(buildCommand());

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.outcome).toBe("created");
    if (value.outcome !== "created") {
      throw new Error("Expected created outcome");
    }
    expect(value.booking.id).toBe(BOOKING_ID);
    expect(value.link.bookingId).toBe(BOOKING_ID);
    expect(value.link.externalReservationId).toBe(EXTERNAL_RESERVATION_ID);
    expect(importPersistence.commitImport).toHaveBeenCalledOnce();
    expect(prepareReservationUseCase.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          confirmImmediately: true,
          writeAudit: false,
          idempotencyKey: ChannelImportKey.create(CONNECTION_ID, EXTERNAL_RESERVATION_ID).value,
        }),
      }),
      expect.objectContaining({
        kind: "channel",
        channel: expect.objectContaining({
          provider: FAKE_CHANNEL_PROVIDER_ID,
          connectionId: CONNECTION_ID,
          externalReservationId: EXTERNAL_RESERVATION_ID,
        }),
      }),
    );
  });

  it("returns duplicate link without prepare or commit", async () => {
    const existingLink = ExternalReservationLink.createLink({
      id: LINK_ID,
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      connectionId: CONNECTION_ID,
      externalReservationId: EXTERNAL_RESERVATION_ID,
      bookingId: BOOKING_ID,
      mappingId: MAPPING_ID,
      mappingVersion: 1,
    });
    await linkRepository.save(existingLink);

    const result = await useCase.execute(buildCommand());

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.outcome).toBe("duplicate");
    if (value.outcome !== "duplicate") {
      throw new Error("Expected duplicate outcome");
    }
    expect(value.link.id).toBe(LINK_ID);
    expect(prepareReservationUseCase.prepare).not.toHaveBeenCalled();
    expect(importPersistence.commitImport).not.toHaveBeenCalled();
  });

  it("fails when mapping version changed since dry-run", async () => {
    const mapping = await mappingRepository.findById(TENANT_ID, MAPPING_ID);
    mapping!.updateExternalMapping({
      externalListingId: "fake-listing-200",
      externalUnitId: "fake-room-a",
    });
    await mappingRepository.save(mapping!);

    const result = await useCase.execute(buildCommand());

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
    expect(result.getError().message).toContain("re-run CM-3a import dry-run");
    expect(prepareReservationUseCase.prepare).not.toHaveBeenCalled();
  });

  it("fails when normalized command unit does not match mapping context", async () => {
    const command = buildCommand({
      normalizedCommand: {
        ...buildNormalizedCommand(),
        unitId: "wrong-unit",
      },
    });

    const result = await useCase.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
    expect(prepareReservationUseCase.prepare).not.toHaveBeenCalled();
  });

  it("fails when external reference id does not match external metadata", async () => {
    const command = buildCommand({
      normalizedCommand: {
        ...buildNormalizedCommand(),
        externalReference: {
          source: FAKE_CHANNEL_PROVIDER_ID,
          externalId: "different-id",
        },
      },
    });

    const result = await useCase.execute(command);

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toContain("external reference id");
    expect(prepareReservationUseCase.prepare).not.toHaveBeenCalled();
  });

  it("propagates Commerce prepare failures without committing", async () => {
    prepareReservationUseCase.prepare.mockResolvedValue(
      Result.fail(new ValidationError("Dates not available")),
    );

    const result = await useCase.execute(buildCommand());

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe("Dates not available");
    expect(importPersistence.commitImport).not.toHaveBeenCalled();
  });

  it("propagates availability commit failures", async () => {
    const prepared = buildPreparedBooking();
    prepareReservationUseCase.prepare.mockResolvedValue(Result.ok(prepared));
    importPersistence.commitImport.mockRejectedValue(
      new ConflictError("Dates no longer available"),
    );

    const result = await useCase.execute(buildCommand());

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe("Dates no longer available");
  });

  it("returns duplicate after link uniqueness race on commit", async () => {
    const prepared = buildPreparedBooking("booking-loser");
    prepareReservationUseCase.prepare.mockResolvedValue(Result.ok(prepared));

    const winnerLink = ExternalReservationLink.createLink({
      id: LINK_ID,
      tenantId: TENANT_ID,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      connectionId: CONNECTION_ID,
      externalReservationId: EXTERNAL_RESERVATION_ID,
      bookingId: BOOKING_ID,
      mappingId: MAPPING_ID,
      mappingVersion: 1,
    });

    importPersistence.commitImport.mockImplementation(async () => {
      await linkRepository.save(winnerLink);
      throw new ConflictError("External reservation link already exists for this connection");
    });

    const result = await useCase.execute(buildCommand());

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.outcome).toBe("duplicate");
    if (value.outcome !== "duplicate") {
      throw new Error("Expected duplicate outcome");
    }
    expect(value.link.bookingId).toBe(BOOKING_ID);
  });

  it("fails when mapping is inactive", async () => {
    const mapping = await mappingRepository.findById(TENANT_ID, MAPPING_ID);
    mapping!.pause();
    await mappingRepository.save(mapping!);

    const result = await useCase.execute(buildCommand());

    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe("Listing mapping is not active");
  });
});

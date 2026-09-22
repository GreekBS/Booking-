import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BookingComAriNotReadyError,
  BookingComPollingProvider,
  BookingComReservationImportProvider,
  BookingComReservationsClientNotConfiguredError,
  BookingComSummaryRecoveryUseCase,
  ChannelConnection,
  ChannelIngressBatchProcessor,
  ChannelProviderRegistry,
  CredentialReference,
  ReceiveChannelEventUseCase,
  ReceiveChannelPollBatchUseCase,
  createBookingComProviderRegistration,
  createBookingComProviderRetrievalPort,
  mapParsedBookingComReservationToProviderMessage,
  parseBookingComReservationXml,
  validateChannelProviderRegistration,
} from "../../../src/channels";
import { InMemoryChannelInboxRepository } from "../../../src/channels/repositories/InMemoryChannelInboxRepository";
import { InMemoryChannelConnectionRepository } from "../../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelCredentialResolver } from "../../../src/channels/infrastructure/InMemoryChannelCredentialResolver";
import { FakeBookingComReservationsClient } from "./helpers/FakeBookingComReservationsClient";
import { Result } from "../../../src/shared/kernel/Result";
import { ChannelInboxDeduplicationKey } from "../../../src/channels/domain/value-objects/ChannelInboxDeduplicationKey";

const FIXTURES = join(__dirname, "fixtures");
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440901";
const TENANT_ID = "550e8400-e29b-41d4-a716-446655440900";

async function seedActiveBookingComConnection(
  connectionRepo: InMemoryChannelConnectionRepository,
  credentialResolver: InMemoryChannelCredentialResolver,
): Promise<void> {
  const draft = ChannelConnection.createDraft({
    id: CONNECTION_ID,
    tenantId: TENANT_ID,
    provider: "booking_com",
    displayName: "Booking.com",
  });
  const cred = CredentialReference.create("cred-booking-1");
  draft.attachCredentials(cred);
  await connectionRepo.create(draft);
  const loaded = await connectionRepo.findById(TENANT_ID, CONNECTION_ID);
  loaded!.activate();
  await connectionRepo.activateWithExpectedSemanticVersion(
    loaded!,
    loaded!.semanticConfigVersion,
    "pending_auth",
  );
  credentialResolver.seedCredential(cred, {
    client_id: "cid",
    client_secret: "sec",
    hotel_id: "8135188",
  });
}

describe("CM-4c-2 — XML parsing", () => {
  it("parses create/modify/cancel fixtures with identities", () => {
    const create = parseBookingComReservationXml(
      readFileSync(join(FIXTURES, "reservation-create.xml"), "utf8"),
    );
    expect(create.kind).toBe("create");
    expect(create.reservationId).toBe("1234567890");
    expect(create.hotelId).toBe("8135188");
    expect(create.roomTypeId).toBe("1000202");
    expect(create.arrivalDate).toBe("2026-10-01");

    expect(
      parseBookingComReservationXml(
        readFileSync(join(FIXTURES, "reservation-modify.xml"), "utf8"),
      ).kind,
    ).toBe("modify");
    expect(
      parseBookingComReservationXml(
        readFileSync(join(FIXTURES, "reservation-cancel.xml"), "utf8"),
      ).kind,
    ).toBe("cancel");
  });

  it("rejects empty/malformed XML deterministically", () => {
    expect(() => parseBookingComReservationXml("")).toThrow(/empty/i);
    expect(() => parseBookingComReservationXml("<root/>")).toThrow(/HotelReservation/i);
  });
});

describe("CM-4c-2 — import mapping", () => {
  const importer = new BookingComReservationImportProvider();

  it("maps create/modify/cancel from provider messages", async () => {
    const createMsg = mapParsedBookingComReservationToProviderMessage({
      parsed: parseBookingComReservationXml(
        readFileSync(join(FIXTURES, "reservation-create.xml"), "utf8"),
      ),
      connectionId: CONNECTION_ID,
      providerMessageId: "m1",
    });
    const createMapped = await importer.mapMessage(createMsg, {
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      propertyId: "prop-1",
      unitId: "unit-1",
    });
    expect(createMapped.kind).toBe("create");

    const modifyMapped = await importer.mapMessage(
      mapParsedBookingComReservationToProviderMessage({
        parsed: parseBookingComReservationXml(
          readFileSync(join(FIXTURES, "reservation-modify.xml"), "utf8"),
        ),
        connectionId: CONNECTION_ID,
        providerMessageId: "m2",
      }),
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        propertyId: "prop-1",
        unitId: "unit-1",
      },
    );
    expect(modifyMapped.kind).toBe("modify");

    const cancelMapped = await importer.mapMessage(
      mapParsedBookingComReservationToProviderMessage({
        parsed: parseBookingComReservationXml(
          readFileSync(join(FIXTURES, "reservation-cancel.xml"), "utf8"),
        ),
        connectionId: CONNECTION_ID,
        providerMessageId: "m3",
      }),
      {
        tenantId: TENANT_ID,
        connectionId: CONNECTION_ID,
        propertyId: "prop-1",
        unitId: "unit-1",
      },
    );
    expect(cancelMapped.kind).toBe("cancel");
  });
});

describe("CM-4c-2 — registration defaults", () => {
  it("uses real polling/import with not-configured HTTP client by default", async () => {
    const registration = createBookingComProviderRegistration();
    expect(() => validateChannelProviderRegistration(registration)).not.toThrow();
    expect(registration.polling).toBeInstanceOf(BookingComPollingProvider);
    expect(registration.reservationImport).toBeInstanceOf(
      BookingComReservationImportProvider,
    );
    await expect(
      registration.polling!.poll(CONNECTION_ID, null, {
        credentialMaterial: { client_id: "x", client_secret: "y" },
      }),
    ).rejects.toBeInstanceOf(BookingComReservationsClientNotConfiguredError);
    await expect(
      registration.availabilityExport!.publishAvailability({
        tenantId: TENANT_ID,
        unitId: "u1",
        connectionId: CONNECTION_ID,
        mappingId: "m1",
        from: "2026-10-01",
        to: "2026-10-02",
        revision: 1,
      }),
    ).rejects.toBeInstanceOf(BookingComAriNotReadyError);
  });
});

describe("CM-4c-2 — durable Receive before ACK", () => {
  it("ACKs only after durable Receive; ACK failure retains inbox evidence", async () => {
    const fake = new FakeBookingComReservationsClient();
    fake.seedFixtures({ includeCreate: true });

    const registration = createBookingComProviderRegistration({
      reservationsClient: fake,
    });
    const registry = new ChannelProviderRegistry();
    registry.register(registration);

    const inboxRepository = new InMemoryChannelInboxRepository();
    const enqueueJob = {
      execute: vi.fn(async () => Result.ok({ jobId: "job-1", deduplicated: false })),
    };
    let inboxSeq = 0;
    const receive = new ReceiveChannelEventUseCase(
      inboxRepository,
      enqueueJob as never,
      { generate: () => `inbox-${++inboxSeq}` },
    );
    const batchProcessor = new ChannelIngressBatchProcessor(receive);
    const connectionRepo = new InMemoryChannelConnectionRepository();
    const credentialResolver = new InMemoryChannelCredentialResolver();
    await seedActiveBookingComConnection(connectionRepo, credentialResolver);

    const pollBatch = new ReceiveChannelPollBatchUseCase(
      connectionRepo,
      credentialResolver,
      registry,
      batchProcessor,
    );

    const first = await pollBatch.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "booking_com",
      cursorPayload: null,
    });
    expect(first.ackAllowed).toBe(true);
    expect(first.results.every((r) => r.success)).toBe(true);
    expect(fake.acknowledged).toHaveLength(1);

    const createKey = ChannelInboxDeduplicationKey.forCreate(
      CONNECTION_ID,
      "1234567890",
    ).value;
    const stored = await inboxRepository.findByDeduplicationKey(TENANT_ID, createKey);
    expect(stored).not.toBeNull();

    fake.seedFixtures({ includeCreate: true });
    fake.failAcknowledgeOnce = true;
    const third = await pollBatch.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "booking_com",
      cursorPayload: null,
    });
    expect(third.ackAllowed).toBe(true);
    const after = await inboxRepository.findByDeduplicationKey(TENANT_ID, createKey);
    expect(after).not.toBeNull();
  });

  it("does not ACK when Receive fails", async () => {
    const fake = new FakeBookingComReservationsClient();
    fake.seedFixtures({ includeCreate: true });
    const registration = createBookingComProviderRegistration({
      reservationsClient: fake,
    });
    const registry = new ChannelProviderRegistry();
    registry.register(registration);

    const failingReceive = {
      execute: vi.fn(async () => Result.fail(new Error("receive failed"))),
    };
    const batchProcessor = new ChannelIngressBatchProcessor(failingReceive as never);
    const connectionRepo = new InMemoryChannelConnectionRepository();
    const credentialResolver = new InMemoryChannelCredentialResolver();
    await seedActiveBookingComConnection(connectionRepo, credentialResolver);

    const pollBatch = new ReceiveChannelPollBatchUseCase(
      connectionRepo,
      credentialResolver,
      registry,
      batchProcessor,
    );
    const result = await pollBatch.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "booking_com",
      cursorPayload: null,
    });
    expect(result.ackAllowed).toBe(false);
    expect(fake.acknowledged).toHaveLength(0);
  });
});

describe("CM-4c-2 — retrieval create/modify/cancel + identity", () => {
  it("retrieves create/modify/cancel with distinct durable identities", async () => {
    const fake = new FakeBookingComReservationsClient();
    fake.seedFixtures({
      includeCreate: true,
      includeModify: true,
      includeCancel: true,
    });
    const registration = createBookingComProviderRegistration({
      reservationsClient: fake,
    });
    const poll = await registration.polling!.poll(CONNECTION_ID, null, {
      credentialMaterial: { hotel_id: "8135188" },
    });
    expect(poll.messages.map((m) => m.kind)).toEqual([
      "reservation.create",
      "reservation.modify",
      "reservation.cancel",
    ]);

    const keys = poll.messages.map((m) =>
      ChannelInboxDeduplicationKey.forReservationEvent(CONNECTION_ID, m).value,
    );
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toMatch(/^ingress:create:/);
    expect(keys[1]).toMatch(/^ingress:modify:/);
    expect(keys[2]).toMatch(/^ingress:cancel:/);
  });

  it("duplicate create retrieval is safe after durable Receive + ACK", async () => {
    const fake = new FakeBookingComReservationsClient();
    fake.seedFixtures({ includeCreate: true });
    const registration = createBookingComProviderRegistration({
      reservationsClient: fake,
    });
    const registry = new ChannelProviderRegistry();
    registry.register(registration);
    const inboxRepository = new InMemoryChannelInboxRepository();
    let inboxSeq = 0;
    const enqueueJob = {
      execute: vi.fn(async () => Result.ok({ jobId: "job-1", deduplicated: false })),
    };
    const receive = new ReceiveChannelEventUseCase(
      inboxRepository,
      enqueueJob as never,
      { generate: () => `inbox-${++inboxSeq}` },
    );
    const batchProcessor = new ChannelIngressBatchProcessor(receive);
    const connectionRepo = new InMemoryChannelConnectionRepository();
    const credentialResolver = new InMemoryChannelCredentialResolver();
    await seedActiveBookingComConnection(connectionRepo, credentialResolver);
    const pollBatch = new ReceiveChannelPollBatchUseCase(
      connectionRepo,
      credentialResolver,
      registry,
      batchProcessor,
    );

    const first = await pollBatch.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "booking_com",
      cursorPayload: null,
    });
    expect(first.results.every((r) => r.success)).toBe(true);
    expect(fake.acknowledged).toHaveLength(1);

    fake.seedFixtures({ includeCreate: true });
    const second = await pollBatch.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "booking_com",
      cursorPayload: null,
    });
    expect(second.results.every((r) => r.success)).toBe(true);
    expect(second.results.some((r) => r.deduplicated === true)).toBe(true);
  });
});

describe("CM-4c-2 — out-of-order + stale modify", () => {
  it("modify-before-create does not invent a booking", async () => {
    const modifyMsg = mapParsedBookingComReservationToProviderMessage({
      parsed: parseBookingComReservationXml(
        readFileSync(join(FIXTURES, "reservation-modify.xml"), "utf8"),
      ),
      connectionId: CONNECTION_ID,
      providerMessageId: "m-mod-early",
    });
    const registry = new ChannelProviderRegistry();
    registry.register(createBookingComProviderRegistration());
    const connectionRepo = new InMemoryChannelConnectionRepository();
    const credentialResolver = new InMemoryChannelCredentialResolver();
    await seedActiveBookingComConnection(connectionRepo, credentialResolver);

    const dryRun = new (
      await import("../../../src/channels/application/ImportChannelReservationModifyDryRunUseCase")
    ).ImportChannelReservationModifyDryRunUseCase(
      registry,
      connectionRepo,
      { findByExternalListing: async () => null, findById: async () => null } as never,
      { findByExternalReservation: async () => null } as never,
    );
    const result = await dryRun.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "booking_com",
      message: modifyMsg,
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/cannot invent a booking/i);
  });

  it("cancel-before-create does not invent a booking", async () => {
    const cancelMsg = mapParsedBookingComReservationToProviderMessage({
      parsed: parseBookingComReservationXml(
        readFileSync(join(FIXTURES, "reservation-cancel.xml"), "utf8"),
      ),
      connectionId: CONNECTION_ID,
      providerMessageId: "m-cancel-early",
    });
    const registry = new ChannelProviderRegistry();
    registry.register(createBookingComProviderRegistration());
    const connectionRepo = new InMemoryChannelConnectionRepository();
    const credentialResolver = new InMemoryChannelCredentialResolver();
    await seedActiveBookingComConnection(connectionRepo, credentialResolver);

    const dryRun = new (
      await import("../../../src/channels/application/ImportChannelReservationCancelDryRunUseCase")
    ).ImportChannelReservationCancelDryRunUseCase(
      registry,
      connectionRepo,
      { findByExternalReservation: async () => null } as never,
    );
    const result = await dryRun.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "booking_com",
      message: cancelMsg,
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/cannot invent a booking/i);
  });

  it("stale modification is treated as already_applied/stale_revision", async () => {
    const registry = new ChannelProviderRegistry();
    registry.register(createBookingComProviderRegistration());
    const link = {
      id: "link-1",
      bookingId: "booking-1",
      tenantId: TENANT_ID,
      mappingId: "map-1",
      externalRevision: "2026-09-01T12:00:00+00:00",
      status: "synced",
    };
    const dryRun = new (
      await import("../../../src/channels/application/ImportChannelReservationModifyDryRunUseCase")
    ).ImportChannelReservationModifyDryRunUseCase(
      registry,
      {
        findById: async () => ({ status: "active" }),
      } as never,
      {
        findByExternalListing: async () => ({
          status: "active",
          propertyId: "prop-1",
          unitId: "unit-1",
          mappingVersion: 1,
        }),
        findById: async () => ({
          status: "active",
          propertyId: "prop-1",
          unitId: "unit-1",
          mappingVersion: 1,
        }),
      } as never,
      {
        findByExternalReservation: async () => link,
      } as never,
    );

    const modifyMsg = mapParsedBookingComReservationToProviderMessage({
      parsed: parseBookingComReservationXml(
        readFileSync(join(FIXTURES, "reservation-modify.xml"), "utf8"),
      ),
      connectionId: CONNECTION_ID,
      providerMessageId: "m-stale",
    });
    // Force revision equal to existing → stale
    modifyMsg.payload.externalRevision = link.externalRevision;

    const result = await dryRun.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "booking_com",
      message: modifyMsg,
    });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toMatchObject({
      duplicate: true,
      reason: "stale_revision",
    });
  });
});

describe("CM-4c-2 — mapping failure + security", () => {
  it("create missing dates maps to unrecognized (no silent invent)", async () => {
    const importer = new BookingComReservationImportProvider();
    const msg = mapParsedBookingComReservationToProviderMessage({
      parsed: parseBookingComReservationXml(
        readFileSync(join(FIXTURES, "reservation-create.xml"), "utf8"),
      ),
      connectionId: CONNECTION_ID,
      providerMessageId: "m-bad",
    });
    delete msg.payload.arrivalDate;
    delete msg.payload.departureDate;
    const mapped = await importer.mapMessage(msg, {
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      propertyId: "prop-1",
      unitId: "unit-1",
    });
    expect(mapped.kind).toBe("unrecognized");
  });

  it("parse errors omit guest/payment content from diagnostics", () => {
    try {
      parseBookingComReservationXml("<HotelReservation><Guest>SECRET_GUEST</Guest></HotelReservation>");
      expect.fail("expected throw");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toMatch(/SECRET_GUEST/);
      expect(message).toMatch(/ResStatus|kind/i);
    }
  });

  it("retains RUID safely on mapped provider message", () => {
    const parsed = parseBookingComReservationXml(
      readFileSync(join(FIXTURES, "reservation-create.xml"), "utf8"),
    );
    const msg = mapParsedBookingComReservationToProviderMessage({
      parsed,
      connectionId: CONNECTION_ID,
      providerMessageId: "m-ruid",
    });
    if (parsed.ruid) {
      expect(msg.payload.ruid).toBe(parsed.ruid);
    }
  });
});

describe("CM-4c-2 — modify/cancel processing + inventory conflict", () => {
  it("wired ProcessChannelInbox routes modify/cancel (not UNSUPPORTED)", async () => {
    const { ProcessChannelInboxItemUseCase } = await import(
      "../../../src/channels/application/ProcessChannelInboxItemUseCase"
    );
    const { ChannelInboxItem } = await import(
      "../../../src/channels/domain/ChannelInboxItem"
    );
    const inboxRepository = new InMemoryChannelInboxRepository();
    const modifyDryRun = {
      execute: vi.fn(async () =>
        Result.ok({
          duplicate: false,
          mapping: {
            externalReference: { source: "booking_com", externalId: "1234567890" },
            connectionId: CONNECTION_ID,
            proposed: {
              unitId: "unit-1",
              checkIn: "2026-10-02",
              checkOut: "2026-10-05",
              guestCount: 2,
            },
            idempotencyKey: "ik-mod",
          },
          existingLink: { id: "link-1", bookingId: "booking-1" },
          mappingVersion: 1,
        }),
      ),
    };
    const modifyCommand = {
      execute: vi.fn(async () =>
        Result.ok({
          outcome: "applied",
          booking: { id: "booking-1" },
          link: { id: "link-1" },
        }),
      ),
    };
    const cancelDryRun = {
      execute: vi.fn(async () =>
        Result.ok({
          duplicate: false,
          mapping: {
            externalReference: { source: "booking_com", externalId: "1234567890" },
            connectionId: CONNECTION_ID,
            reason: "Cancelled on Booking.com",
            idempotencyKey: "ik-cancel",
          },
          existingLink: { id: "link-1", bookingId: "booking-1" },
        }),
      ),
    };
    const cancelCommand = {
      execute: vi.fn(async () =>
        Result.ok({
          outcome: "cancelled",
          booking: { id: "booking-1" },
          link: { id: "link-1" },
        }),
      ),
    };
    const useCase = new ProcessChannelInboxItemUseCase(
      inboxRepository,
      { execute: vi.fn() } as never,
      { execute: vi.fn() } as never,
      { generate: () => "tok-1" },
      modifyDryRun as never,
      modifyCommand as never,
      cancelDryRun as never,
      cancelCommand as never,
    );

    const modifyMessage = mapParsedBookingComReservationToProviderMessage({
      parsed: parseBookingComReservationXml(
        readFileSync(join(FIXTURES, "reservation-modify.xml"), "utf8"),
      ),
      connectionId: CONNECTION_ID,
      providerMessageId: "proc-mod",
    });
    const modifyItem = ChannelInboxItem.createNew({
      id: "inbox-mod-1",
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "booking_com",
      ingressKind: "poll",
      message: modifyMessage,
      deduplicationKey: ChannelInboxDeduplicationKey.forReservationEvent(
        CONNECTION_ID,
        modifyMessage,
      ),
    });
    await inboxRepository.insert(modifyItem);
    const modResult = await useCase.execute({
      tenantId: TENANT_ID,
      inboxItemId: "inbox-mod-1",
      workerId: "w1",
    });
    expect(modResult.getValue().outcome).toBe("SUCCESS");
    expect(modifyCommand.execute).toHaveBeenCalled();

    const cancelMessage = mapParsedBookingComReservationToProviderMessage({
      parsed: parseBookingComReservationXml(
        readFileSync(join(FIXTURES, "reservation-cancel.xml"), "utf8"),
      ),
      connectionId: CONNECTION_ID,
      providerMessageId: "proc-cancel",
    });
    const cancelItem = ChannelInboxItem.createNew({
      id: "inbox-cancel-1",
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      provider: "booking_com",
      ingressKind: "poll",
      message: cancelMessage,
      deduplicationKey: ChannelInboxDeduplicationKey.forReservationEvent(
        CONNECTION_ID,
        cancelMessage,
      ),
    });
    await inboxRepository.insert(cancelItem);
    const cancelResult = await useCase.execute({
      tenantId: TENANT_ID,
      inboxItemId: "inbox-cancel-1",
      workerId: "w1",
    });
    expect(cancelResult.getValue().outcome).toBe("SUCCESS");
    expect(cancelCommand.execute).toHaveBeenCalled();
  });

  it("modify inventory conflict maps to ConflictError without inventing booking", async () => {
    const { ImportChannelReservationModifyCommandUseCase } = await import(
      "../../../src/channels/application/ImportChannelReservationModifyCommandUseCase"
    );
    const { ConflictError } = await import("../../../src/shared/errors/DomainError");
    const { AVAILABILITY_CONFLICT_MESSAGE } = await import(
      "../../../src/channels/application/ChannelInboxOutcomeClassifier"
    );
    const useCase = new ImportChannelReservationModifyCommandUseCase(
      {
        findById: async () => ({
          id: "booking-1",
          status: "confirmed",
          unitId: "unit-1",
          stayPeriod: { checkIn: { value: "2026-10-01" }, checkOut: { value: "2026-10-03" } },
          guestCount: { value: 2 },
          quoteId: "quote-1",
        }),
      } as never,
      { findById: async () => ({ id: "quote-1" }) } as never,
      { saveStayChange: vi.fn() } as never,
      {
        commitStayChange: async () =>
          Result.fail(new (await import("../../../src/shared/errors/DomainError")).ValidationError(
            "Unit is not available for the selected dates",
          )),
      } as never,
      { save: vi.fn() } as never,
    );

    const result = await useCase.execute({
      mapping: {
        externalReference: { source: "booking_com", externalId: "1234567890" },
        connectionId: CONNECTION_ID,
        proposed: {
          unitId: "unit-2",
          checkIn: "2026-10-02",
          checkOut: "2026-10-06",
          guestCount: 2,
        },
        idempotencyKey: "ik",
      },
      existingLink: {
        bookingId: "booking-1",
        tenantId: TENANT_ID,
        markSynced: vi.fn(),
      } as never,
      mappingVersion: 1,
      externalRevision: "rev-2",
      lastExternalUpdateAt: null,
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ConflictError);
    expect(result.getError().message).toBe(AVAILABILITY_CONFLICT_MESSAGE);
  });
});

describe("CM-4c-2 — summary recovery + worker port", () => {
  it("re-enters summary items via Receive only", async () => {
    const fake = new FakeBookingComReservationsClient();
    fake.seedFixtures({ includeSummary: true });
    const inboxRepository = new InMemoryChannelInboxRepository();
    const enqueueJob = {
      execute: vi.fn(async () => Result.ok({ jobId: "job-1", deduplicated: false })),
    };
    const receive = new ReceiveChannelEventUseCase(
      inboxRepository,
      enqueueJob as never,
      { generate: () => "inbox-summary-1" },
    );
    const recovery = new BookingComSummaryRecoveryUseCase(fake, receive);
    const result = await recovery.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      fallbackHotelId: "8135188",
    });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().scanned).toBe(1);
    expect(enqueueJob.execute).toHaveBeenCalled();
  });

  it("worker retrieval port invokes poll orchestration", async () => {
    const executePollConnection = vi.fn(async () => undefined);
    const port = createBookingComProviderRetrievalPort({
      listActiveBookingComConnections: async () => [
        { tenantId: TENANT_ID, connectionId: CONNECTION_ID },
      ],
      executePollConnection,
    });
    await port.retrieveAndIngress({
      signal: new AbortController().signal,
      now: new Date(),
    });
    expect(executePollConnection).toHaveBeenCalledTimes(1);
  });
});

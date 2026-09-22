import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  BookingComAriClientNotConfiguredError,
  BookingComAvailabilityExportProvider,
  BookingComRateRestrictionExportProvider,
  ChannelConnection,
  ChannelListingMapping,
  CredentialReference,
  ExecuteBookingComAriPushUseCase,
  BookingComAriRetryablePushError,
  InMemoryBookingComAriPushLedger,
  InMemoryChannelConnectionRepository,
  InMemoryChannelListingMappingRepository,
  RequestBookingComAriPropagationUseCase,
  BookingComAriPushOutboxHandler,
  PushBookingComAriJobHandler,
  batchBookingComAriProjectionByMonth,
  buildBookingComAriAvailabilityXml,
  buildBookingComAriSnapshotBatches,
  coalesceBookingComAriProjections,
  createBookingComProviderRegistration,
  enumerateMonthKeys,
  isStaleBookingComAriGeneration,
  parseBookingComAriPushResponse,
  projectAvailabilityDeltaToBookingCom,
  projectRateDeltaToBookingCom,
  projectRestrictionDeltaToBookingCom,
  shouldSuppressChannelOutboundEcho,
  BOOKING_COM_ARI_EVENTS,
  BOOKING_COM_ARI_PUSH_OUTBOX_EVENT_TYPE,
} from "../../../src/channels";
import { PUSH_BOOKING_COM_ARI_JOB_TYPE } from "../../../src/platform/async/jobs/types/JobTypes";
import { Result } from "../../../src/shared/kernel/Result";
import type { DomainEvent } from "../../../src/shared/kernel/DomainEvent";
import type { OutboxEntry } from "../../../src/shared/types/index";
import { FakeBookingComAriClient } from "./helpers/FakeBookingComAriClient";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440900";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440901";
const MAPPING_ID = "550e8400-e29b-41d4-a716-446655440902";
const FIXTURES = join(__dirname, "fixtures");

class MemoryOutbox {
  readonly events: DomainEvent[] = [];
  async saveEvents(events: DomainEvent[]): Promise<void> {
    this.events.push(...events);
  }
  async findUnprocessed(): Promise<OutboxEntry[]> {
    return [];
  }
  async claimBatch(): Promise<OutboxEntry[]> {
    return [];
  }
  async markProcessed(): Promise<void> {}
  async markCompleted(): Promise<void> {}
  async markFailed(): Promise<"retry"> {
    return "retry";
  }
}

async function seedActiveConnectionAndMapping(
  connections: InMemoryChannelConnectionRepository,
  mappings: InMemoryChannelListingMappingRepository,
): Promise<void> {
  const draft = ChannelConnection.createDraft({
    id: CONNECTION_ID,
    tenantId: TENANT_ID,
    provider: "booking_com",
    displayName: "Booking.com",
  });
  draft.attachCredentials(CredentialReference.create("cred-1"));
  await connections.create(draft);
  const loaded = await connections.findById(TENANT_ID, CONNECTION_ID);
  loaded!.activate();
  await connections.activateWithExpectedSemanticVersion(
    loaded!,
    loaded!.semanticConfigVersion,
    "pending_auth",
  );

  const mapping = ChannelListingMapping.createActive({
    id: MAPPING_ID,
    tenantId: TENANT_ID,
    connectionId: CONNECTION_ID,
    externalListingId: "8135188",
    externalUnitId: "1000202",
    propertyId: "prop-1",
    unitId: "unit-1",
    syncDirection: "bidirectional",
  });
  await mappings.save(mapping);
}

describe("CM-4c-3 — delta projection fields", () => {
  it("projects roomstosell / open-close / Standard price / min-max / CTA / CTD", () => {
    const availability = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_ID,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-10-01",
        to: "2026-10-02",
        revision: 3,
        roomsToSell: 1,
        closed: 0,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      mappingVersion: 1,
      generation: 3,
    });
    expect(availability.availability[0]?.roomsToSell).toBe(1);
    expect(availability.availability[0]?.closed).toBe(0);

    const rates = projectRateDeltaToBookingCom({
      delta: {
        tenantId: TENANT_ID,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-10-01",
        to: "2026-10-02",
        currency: "EUR",
        nightlyRates: [{ date: "2026-10-01", amount: "150.00" }],
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      ratePlanId: "12345",
      mappingVersion: 1,
      generation: 4,
    });
    expect(rates.rates[0]?.price).toBe("150.00");

    const restrictions = projectRestrictionDeltaToBookingCom({
      delta: {
        tenantId: TENANT_ID,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-10-01",
        to: "2026-10-03",
        minStay: 2,
        maxStay: 14,
        closedToArrival: false,
        closedToDeparture: true,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      ratePlanId: "12345",
      mappingVersion: 1,
      generation: 5,
    });
    expect(restrictions.restrictions[0]).toMatchObject({
      minimumStay: 2,
      maximumStay: 14,
      closedToArrival: 0,
      closedToDeparture: 1,
    });
  });

  it("fails closed on unsupported pricing model for rates", () => {
    expect(() =>
      projectRateDeltaToBookingCom({
        delta: {
          tenantId: TENANT_ID,
          unitId: "u",
          connectionId: CONNECTION_ID,
          mappingId: MAPPING_ID,
          from: "2026-10-01",
          to: "2026-10-02",
          currency: "EUR",
          nightlyRates: [{ date: "2026-10-01", amount: "10" }],
        },
        hotelId: "8135188",
        roomTypeId: "1000202",
        ratePlanId: "12345",
        mappingVersion: 1,
        generation: 1,
        pricingModel: "OBP",
      }),
    ).toThrow(/Standard pricing only/i);
  });
});

describe("CM-4c-3 — batching + month boundaries", () => {
  it("splits cross-month ranges and builds snapshot primitives", () => {
    expect(enumerateMonthKeys("2026-10-30", "2026-11-02")).toEqual([
      "2026-10",
      "2026-11",
    ]);
    const projection = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_ID,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-10-30",
        to: "2026-11-02",
        revision: 1,
        roomsToSell: 1,
        closed: 0,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      mappingVersion: 1,
      generation: 1,
    });
    const batches = batchBookingComAriProjectionByMonth(projection);
    expect(batches.map((b) => b.monthKey)).toEqual(["2026-10", "2026-11"]);
    expect(new Set(batches.map((b) => b.hotelId)).size).toBe(1);

    const snapshot = buildBookingComAriSnapshotBatches([projection]);
    expect(snapshot.length).toBe(2);
  });
});

describe("CM-4c-3 — coalesce + stale suppression", () => {
  it("keeps newest generation and classifies stale work", () => {
    const a = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_ID,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-10-01",
        to: "2026-10-02",
        revision: 100,
        roomsToSell: 1,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      mappingVersion: 1,
      generation: 100,
    });
    const b = { ...a, generation: 120, availability: [{ ...a.availability[0]!, roomsToSell: 2 }] };
    const c = { ...a, generation: 110, availability: [{ ...a.availability[0]!, roomsToSell: 3 }] };
    const coalesced = coalesceBookingComAriProjections([a, b, c]);
    expect(coalesced).toHaveLength(1);
    expect(coalesced[0]?.generation).toBe(120);
    expect(coalesced[0]?.availability[0]?.roomsToSell).toBe(2);

    expect(
      isStaleBookingComAriGeneration({
        candidateGeneration: 100,
        highestKnownGeneration: 120,
        lastSucceededGeneration: null,
      }),
    ).toBe("stale_vs_pending");
    expect(
      isStaleBookingComAriGeneration({
        candidateGeneration: 100,
        highestKnownGeneration: 120,
        lastSucceededGeneration: 120,
      }),
    ).toBe("stale_vs_success");
  });
});

describe("CM-4c-3 — XML + partial HTTP 200 + RUID", () => {
  it("builds request XML and parses partial-error fixture", () => {
    const projection = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_ID,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-10-01",
        to: "2026-10-02",
        revision: 1,
        roomsToSell: 1,
        closed: 0,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      mappingVersion: 1,
      generation: 1,
    });
    const [batch] = batchBookingComAriProjectionByMonth(projection);
    const xml = buildBookingComAriAvailabilityXml(batch!);
    expect(xml).toContain("<roomstosell>1</roomstosell>");
    expect(xml).toContain("<closed>0</closed>");

    const partial = parseBookingComAriPushResponse({
      httpStatus: 200,
      body: readFileSync(join(FIXTURES, "ari-partial-error-response.xml"), "utf8"),
    });
    expect(partial.success).toBe(false);
    expect(partial.ruid).toBeTruthy();
    expect(partial.errors[0]?.code).toBe("RATE_NOT_ACTIVE_FOR_ROOM");
  });
});

describe("CM-4c-3 — durable schedule + push + retries", () => {
  it("schedules outbox, pushes via fake client, suppresses loops and stale gens", async () => {
    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    await seedActiveConnectionAndMapping(connections, mappings);
    const outbox = new MemoryOutbox();
    const ledger = new InMemoryBookingComAriPushLedger();
    const request = new RequestBookingComAriPropagationUseCase(
      connections,
      mappings,
      outbox as never,
      ledger,
    );

    const projection = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_ID,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-10-01",
        to: "2026-10-02",
        revision: 10,
        roomsToSell: 1,
        closed: 0,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      mappingVersion: 1,
      generation: 10,
    });

    const scheduled = await request.execute({ projection });
    expect(scheduled.getValue().outcome).toBe("scheduled");
    expect(outbox.events[0]?.eventType).toBe(BOOKING_COM_ARI_PUSH_OUTBOX_EVENT_TYPE);

    const loop = await request.execute({
      projection: { ...projection, inboundOriginProvider: "booking_com", generation: 11 },
    });
    expect(loop.getValue().outcome).toBe("suppressed_loop");

    const events: string[] = [];
    const fake = new FakeBookingComAriClient();
    const execute = new ExecuteBookingComAriPushUseCase(
      connections,
      mappings,
      ledger,
      fake,
      (fields) => {
        if (typeof fields.event === "string") events.push(fields.event);
      },
    );

    const coalesceKey = (scheduled.getValue() as { coalesceKeys: string[] }).coalesceKeys[0]!;
    const pushed = await execute.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      coalesceKey,
      generation: 10,
    });
    expect(pushed.getValue().outcome).toBe("pushed");
    expect(fake.pushed).toHaveLength(1);
    expect(events).toContain(BOOKING_COM_ARI_EVENTS.PUSH_STARTED);
    expect(events).toContain(BOOKING_COM_ARI_EVENTS.PUSH_SUCCESS);

    const stale = await execute.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      coalesceKey,
      generation: 9,
    });
    expect(stale.getValue().outcome).toBe("stale_suppressed");
    expect(events).toContain(BOOKING_COM_ARI_EVENTS.STALE_SUPPRESSED);
  });

  it("retries network / 429 / 5xx and records partial + permanent failures", async () => {
    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    await seedActiveConnectionAndMapping(connections, mappings);
    const ledger = new InMemoryBookingComAriPushLedger();
    const projection = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_ID,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-10-01",
        to: "2026-10-02",
        revision: 1,
        roomsToSell: 1,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      mappingVersion: 1,
      generation: 1,
    });
    const coalesceKey = "bcom-ari:k";
    await ledger.upsertPending({ coalesceKey, projection });

    const fake = new FakeBookingComAriClient();
    const execute = new ExecuteBookingComAriPushUseCase(
      connections,
      mappings,
      ledger,
      fake,
    );

    fake.failTransportOnce = true;
    const net = await execute.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      coalesceKey,
      generation: 1,
    });
    expect(net.isFailure).toBe(true);
    expect(net.getError()).toBeInstanceOf(BookingComAriRetryablePushError);

    await ledger.upsertPending({ coalesceKey, projection: { ...projection, generation: 2 } });
    fake.nextHttpStatus = 429;
    const tooMany = await execute.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      coalesceKey,
      generation: 2,
    });
    expect(tooMany.getError()).toBeInstanceOf(BookingComAriRetryablePushError);

    await ledger.upsertPending({ coalesceKey, projection: { ...projection, generation: 3 } });
    fake.nextHttpStatus = 503;
    const five = await execute.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      coalesceKey,
      generation: 3,
    });
    expect(five.getError()).toBeInstanceOf(BookingComAriRetryablePushError);

    await ledger.upsertPending({ coalesceKey, projection: { ...projection, generation: 4 } });
    fake.seedPartialErrorBody();
    const partial = await execute.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      coalesceKey,
      generation: 4,
    });
    expect(partial.getValue().outcome).toBe("partial");

    await ledger.upsertPending({ coalesceKey, projection: { ...projection, generation: 5 } });
    fake.nextHttpStatus = 400;
    const permanent = await execute.execute({
      tenantId: TENANT_ID,
      connectionId: CONNECTION_ID,
      coalesceKey,
      generation: 5,
    });
    expect(permanent.isFailure).toBe(true);
    expect(permanent.getError().message).toMatch(/Permanent/i);
  });

  it("outbox handler enqueues push job; job handler runs execute", async () => {
    const enqueue = {
      execute: vi.fn(async () =>
        Result.ok({
          id: "job-1",
          tenantId: TENANT_ID,
          jobType: PUSH_BOOKING_COM_ARI_JOB_TYPE,
          payload: {},
          status: "pending",
          priority: 0,
          runAt: new Date(),
          idempotencyKey: "k",
          attemptCount: 0,
          maxAttempts: 5,
          createdAt: new Date(),
        }),
      ),
    };
    const handler = new BookingComAriPushOutboxHandler(enqueue as never);
    expect(handler.canHandle(BOOKING_COM_ARI_PUSH_OUTBOX_EVENT_TYPE)).toBe(true);
    await handler.handle({
      id: "ob-1",
      tenantId: TENANT_ID,
      aggregateType: "ChannelAriPush",
      aggregateId: MAPPING_ID,
      eventType: BOOKING_COM_ARI_PUSH_OUTBOX_EVENT_TYPE,
      payload: {
        connectionId: CONNECTION_ID,
        coalesceKey: "bcom-ari:x",
        generation: 7,
        monthKey: "2026-10",
        hotelId: "8135188",
        fieldFamily: "availability",
      },
      status: "processing",
      attemptCount: 0,
    });
    expect(enqueue.execute).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: PUSH_BOOKING_COM_ARI_JOB_TYPE }),
    );

    const execute = {
      execute: vi.fn(async () => Result.ok({ outcome: "pushed", ruid: "r" })),
    };
    const jobHandler = new PushBookingComAriJobHandler(execute as never);
    await jobHandler.run({
      id: "job-1",
      tenantId: TENANT_ID,
      jobType: PUSH_BOOKING_COM_ARI_JOB_TYPE,
      payload: {
        connectionId: CONNECTION_ID,
        coalesceKey: "bcom-ari:x",
        generation: 7,
      },
      status: "processing",
      priority: 0,
      runAt: new Date(),
      idempotencyKey: "k",
      attemptCount: 0,
      maxAttempts: 5,
      createdAt: new Date(),
    });
    expect(execute.execute).toHaveBeenCalled();
  });
});

describe("CM-4c-3 — connection / mapping safety + loop helper", () => {
  it("rejects inactive / missing mapping / inbound-only; suppresses same-provider echo", async () => {
    expect(
      shouldSuppressChannelOutboundEcho({
        outboundProvider: "booking_com",
        inboundOriginProvider: "booking_com",
      }),
    ).toBe(true);
    expect(
      shouldSuppressChannelOutboundEcho({
        outboundProvider: "booking_com",
        inboundOriginProvider: "ical",
      }),
    ).toBe(false);

    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    const outbox = new MemoryOutbox();
    const ledger = new InMemoryBookingComAriPushLedger();
    const request = new RequestBookingComAriPropagationUseCase(
      connections,
      mappings,
      outbox as never,
      ledger,
    );
    const projection = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_ID,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-10-01",
        to: "2026-10-02",
        revision: 1,
        roomsToSell: 1,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      mappingVersion: 1,
      generation: 1,
    });
    const missing = await request.execute({ projection });
    expect(missing.getValue()).toMatchObject({ outcome: "rejected" });

    await seedActiveConnectionAndMapping(connections, mappings);
    const loaded = await connections.findById(TENANT_ID, CONNECTION_ID);
    const version = loaded!.semanticConfigVersion;
    loaded!.pause();
    await connections.pauseWithExpectedSemanticVersion(loaded!, version, "active");
    const pausedResult = await request.execute({ projection });
    expect(pausedResult.getValue()).toMatchObject({
      outcome: "rejected",
      reason: expect.stringMatching(/paused/i),
    });
  });
});

describe("CM-4c-3 — export providers + feature gating defaults", () => {
  it("availability/rate adapters push via injected fake client", async () => {
    const fake = new FakeBookingComAriClient();
    const availability = new BookingComAvailabilityExportProvider({
      ariClient: fake,
      resolveHotelAndRoom: () => ({
        hotelId: "8135188",
        roomTypeId: "1000202",
        mappingVersion: 1,
      }),
    });
    const ok = await availability.publishAvailability({
      tenantId: TENANT_ID,
      unitId: "unit-1",
      connectionId: CONNECTION_ID,
      mappingId: MAPPING_ID,
      from: "2026-10-01",
      to: "2026-10-02",
      revision: 1,
      roomsToSell: 2,
      closed: 1,
    });
    expect(ok.success).toBe(true);
    expect(fake.pushed[0]?.availability[0]?.roomsToSell).toBe(2);
    expect(fake.pushed[0]?.availability[0]?.closed).toBe(1);

    const rates = new BookingComRateRestrictionExportProvider({
      ariClient: fake,
      resolveHotelRoomRate: () => ({
        hotelId: "8135188",
        roomTypeId: "1000202",
        ratePlanId: "12345",
        mappingVersion: 1,
        pricingModel: "Standard",
      }),
    });
    await rates.publishRates({
      tenantId: TENANT_ID,
      unitId: "unit-1",
      connectionId: CONNECTION_ID,
      mappingId: MAPPING_ID,
      from: "2026-10-01",
      to: "2026-10-02",
      currency: "EUR",
      nightlyRates: [{ date: "2026-10-01", amount: "99.00" }],
    });
    await rates.publishRestrictions({
      tenantId: TENANT_ID,
      unitId: "unit-1",
      connectionId: CONNECTION_ID,
      mappingId: MAPPING_ID,
      from: "2026-10-01",
      to: "2026-10-02",
      minStay: 1,
      maxStay: 7,
      closedToArrival: true,
      closedToDeparture: false,
    });
    expect(fake.pushed.length).toBeGreaterThanOrEqual(3);
  });

  it("registration defaults remain fail-closed (no live HTTP)", async () => {
    const registration = createBookingComProviderRegistration();
    expect(registration.availabilityExport).toBeInstanceOf(
      BookingComAvailabilityExportProvider,
    );
    await expect(
      registration.availabilityExport!.publishAvailability({
        tenantId: TENANT_ID,
        unitId: "u1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-10-01",
        to: "2026-10-02",
        revision: 1,
      }),
    ).rejects.toThrow(/mapping must be resolved/i);

    const withClient = createBookingComProviderRegistration({
      ariClient: new FakeBookingComAriClient(),
      availabilityExport: new BookingComAvailabilityExportProvider({
        ariClient: new (await import("./helpers/FakeBookingComAriClient")).FakeBookingComAriClient(),
        resolveHotelAndRoom: () => ({
          hotelId: "8135188",
          roomTypeId: "1000202",
          mappingVersion: 1,
        }),
      }),
    });
    expect(withClient.availabilityExport).toBeTruthy();
    expect(BookingComAriClientNotConfiguredError.CODE).toBe(
      "BOOKING_COM_ARI_CLIENT_NOT_CONFIGURED",
    );
  });
});

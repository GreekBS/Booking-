import { describe, expect, it, vi } from "vitest";
import {
  BookingComAriRetryablePushError,
  BookingComSummaryRecoveryUseCase,
  ChannelConnection,
  ChannelListingMapping,
  ConfirmBookingComInitialSyncUseCase,
  CredentialReference,
  ExecuteBookingComAriPushUseCase,
  InMemoryBookingComAriPushLedger,
  InMemoryChannelConnectionRepository,
  InMemoryChannelInboxRepository,
  InMemoryChannelListingMappingRepository,
  ReceiveChannelEventUseCase,
  RequestBookingComAriPropagationUseCase,
  batchBookingComAriProjectionByMonth,
  bookingComXmlContainedPaymentMaterial,
  buildBookingComAriSnapshotBatches,
  coalesceBookingComAriProjections,
  enumerateMonthKeys,
  isStaleBookingComAriGeneration,
  mapParsedBookingComReservationToProviderMessage,
  parseBookingComReservationXml,
  projectAvailabilityDeltaToBookingCom,
  projectRateDeltaToBookingCom,
  projectRestrictionDeltaToBookingCom,
  redactBookingComSensitiveReservationXml,
  shouldSuppressChannelOutboundEcho,
} from "../../../src/channels";
import { Result } from "../../../src/shared/kernel/Result";
import type { DomainEvent } from "../../../src/shared/kernel/DomainEvent";
import type { OutboxEntry } from "../../../src/shared/types/index";
import { FakeBookingComAriClient } from "./helpers/FakeBookingComAriClient";
import { FakeBookingComReservationsClient } from "./helpers/FakeBookingComReservationsClient";

const TENANT_A = "550e8400-e29b-41d4-a716-446655440900";
const TENANT_B = "550e8400-e29b-41d4-a716-446655440910";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440901";
const MAPPING_ID = "550e8400-e29b-41d4-a716-446655440902";

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

function uuidSuffix(n: number): string {
  return n.toString(16).padStart(12, "0");
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function seedActive(
  connections: InMemoryChannelConnectionRepository,
  mappings: InMemoryChannelListingMappingRepository,
  opts?: { tenantId?: string; connectionId?: string; mappingId?: string },
): Promise<void> {
  const tenantId = opts?.tenantId ?? TENANT_A;
  const connectionId = opts?.connectionId ?? CONNECTION_ID;
  const mappingId = opts?.mappingId ?? MAPPING_ID;
  const draft = ChannelConnection.createDraft({
    id: connectionId,
    tenantId,
    provider: "booking_com",
    displayName: "Booking.com",
  });
  draft.attachCredentials(CredentialReference.create(`cred-${connectionId}`));
  await connections.create(draft);
  const loaded = await connections.findById(tenantId, connectionId);
  loaded!.activate();
  await connections.activateWithExpectedSemanticVersion(
    loaded!,
    loaded!.semanticConfigVersion,
    "pending_auth",
  );
  await mappings.save(
    ChannelListingMapping.createActive({
      id: mappingId,
      tenantId,
      connectionId,
      externalListingId: "8135188",
      externalUnitId: "1000202",
      propertyId: "prop-1",
      unitId: "unit-1",
      syncDirection: "bidirectional",
    }),
  );
}

describe("CM-4c certification red-team — 12+ month ARI horizon", () => {
  it("enumerates ≥12 months and batches roomstosell / rates / restrictions", () => {
    const from = "2026-01-15";
    const to = addDays(from, 370);
    const months = enumerateMonthKeys(from, to);
    expect(months.length).toBeGreaterThanOrEqual(12);
    expect(months[0]).toBe("2026-01");
    expect(months[months.length - 1]).toBe("2027-01");

    const availability = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_A,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from,
        to,
        revision: 1,
        roomsToSell: 1,
        closed: 0,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      mappingVersion: 1,
      generation: 1,
    });
    const rates = projectRateDeltaToBookingCom({
      delta: {
        tenantId: TENANT_A,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from,
        to,
        currency: "EUR",
        nightlyRates: [{ date: from, amount: "150.00" }],
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      ratePlanId: "12345",
      mappingVersion: 1,
      generation: 1,
    });
    const restrictions = projectRestrictionDeltaToBookingCom({
      delta: {
        tenantId: TENANT_A,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from,
        to,
        minStay: 2,
        maxStay: 14,
        closedToArrival: false,
        closedToDeparture: false,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      ratePlanId: "12345",
      mappingVersion: 1,
      generation: 1,
    });

    expect(availability.availability[0]?.roomsToSell).toBe(1);
    expect(rates.rates[0]?.price).toBe("150.00");
    expect(restrictions.restrictions[0]).toMatchObject({
      minimumStay: 2,
      maximumStay: 14,
      closedToArrival: 0,
      closedToDeparture: 0,
    });

    const monthsAvail = batchBookingComAriProjectionByMonth(availability);
    expect(monthsAvail.length).toBe(months.length);

    const snapshot = buildBookingComAriSnapshotBatches([
      availability,
      rates,
      restrictions,
    ]);
    expect(snapshot.length).toBe(months.length);
  });

  it("schedules durable month coalesce keys for 12 months without cross-tenant bleed", async () => {
    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    const outbox = new MemoryOutbox();
    const ledger = new InMemoryBookingComAriPushLedger();
    await seedActive(connections, mappings);
    await seedActive(connections, mappings, {
      tenantId: TENANT_B,
      connectionId: "550e8400-e29b-41d4-a716-446655440911",
      mappingId: "550e8400-e29b-41d4-a716-446655440912",
    });

    const request = new RequestBookingComAriPropagationUseCase(
      connections,
      mappings,
      outbox as never,
      ledger,
    );

    const from = "2026-03-01";
    const to = addDays(from, 365);
    const projection = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_A,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from,
        to,
        revision: 1,
        roomsToSell: 0,
        closed: 1,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      mappingVersion: 1,
      generation: 9,
    });

    const result = await request.execute({ projection });
    expect(result.getValue()).toMatchObject({ outcome: "scheduled" });
    const value = result.getValue();
    if (value.outcome !== "scheduled") return;
    expect(value.coalesceKeys.length).toBeGreaterThanOrEqual(12);
    expect(outbox.events.every((e) => e.tenantId === TENANT_A)).toBe(true);
  });
});

describe("CM-4c certification red-team — pause / outage / stale / loop", () => {
  it("defers ARI push while paused (retryable) so durable work survives resume", async () => {
    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    const outbox = new MemoryOutbox();
    const ledger = new InMemoryBookingComAriPushLedger();
    const fake = new FakeBookingComAriClient();
    await seedActive(connections, mappings);

    const request = new RequestBookingComAriPropagationUseCase(
      connections,
      mappings,
      outbox as never,
      ledger,
    );
    const execute = new ExecuteBookingComAriPushUseCase(
      connections,
      mappings,
      ledger,
      fake,
    );

    const projection = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_A,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-10-01",
        to: "2026-10-05",
        revision: 1,
        roomsToSell: 1,
        closed: 0,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      mappingVersion: 1,
      generation: 2,
    });
    const scheduled = await request.execute({ projection });
    const keys =
      scheduled.getValue().outcome === "scheduled"
        ? scheduled.getValue().coalesceKeys
        : [];
    expect(keys.length).toBeGreaterThan(0);

    const loaded = await connections.findById(TENANT_A, CONNECTION_ID);
    const version = loaded!.semanticConfigVersion;
    loaded!.pause();
    await connections.pauseWithExpectedSemanticVersion(loaded!, version, "active");

    const paused = await execute.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      coalesceKey: keys[0]!,
      generation: 2,
    });
    expect(paused.isFailure).toBe(true);
    expect(paused.getError()).toBeInstanceOf(BookingComAriRetryablePushError);
    expect(fake.pushed).toHaveLength(0);

    expect(
      isStaleBookingComAriGeneration({
        candidateGeneration: 1,
        highestKnownGeneration: 2,
        lastSucceededGeneration: null,
      }),
    ).toBe("stale_vs_pending");
  });

  it("keeps newest generation on rapid coalesce and suppresses booking_com echo loops", () => {
    const a = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_A,
        unitId: "u",
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
    const b = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_A,
        unitId: "u",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-10-01",
        to: "2026-10-02",
        revision: 1,
        roomsToSell: 0,
        closed: 1,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      mappingVersion: 1,
      generation: 5,
    });
    const c = { ...a, generation: 3 };
    const kept = coalesceBookingComAriProjections([a, b, c]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.generation).toBe(5);

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
  });

  it("retries prolonged provider outage (5xx) then recovers newest state", async () => {
    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    const ledger = new InMemoryBookingComAriPushLedger();
    const outbox = new MemoryOutbox();
    const fake = new FakeBookingComAriClient();
    await seedActive(connections, mappings);
    const request = new RequestBookingComAriPropagationUseCase(
      connections,
      mappings,
      outbox as never,
      ledger,
    );
    const execute = new ExecuteBookingComAriPushUseCase(
      connections,
      mappings,
      ledger,
      fake,
    );
    const projection = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_A,
        unitId: "unit-1",
        connectionId: CONNECTION_ID,
        mappingId: MAPPING_ID,
        from: "2026-11-01",
        to: "2026-11-03",
        revision: 1,
        roomsToSell: 2,
        closed: 0,
      },
      hotelId: "8135188",
      roomTypeId: "1000202",
      mappingVersion: 1,
      generation: 1,
    });
    const scheduled = await request.execute({ projection });
    const key =
      scheduled.getValue().outcome === "scheduled"
        ? scheduled.getValue().coalesceKeys[0]!
        : "";

    for (let i = 0; i < 3; i += 1) {
      fake.nextHttpStatus = 503;
      const attempt = await execute.execute({
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        coalesceKey: key,
        generation: 1,
      });
      expect(attempt.isFailure).toBe(true);
      expect(attempt.getError()).toBeInstanceOf(BookingComAriRetryablePushError);
    }
    expect(fake.pushed.length).toBe(3);

    fake.nextHttpStatus = 200;
    const recovered = await execute.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      coalesceKey: key,
      generation: 1,
    });
    expect(recovered.getValue().outcome).toBe("pushed");
  });
});

describe("CM-4c certification red-team — reservation recovery + payment redaction", () => {
  it("summary recovery re-enters only through ReceiveChannelEventUseCase", async () => {
    const fake = new FakeBookingComReservationsClient();
    fake.seedFixtures({ includeCreate: false, includeSummary: true });
    const receive = {
      execute: vi.fn(async () =>
        Result.ok({ inboxItemId: "i1", deduplicated: false, jobId: "j1" }),
      ),
    };
    const recovery = new BookingComSummaryRecoveryUseCase(
      fake,
      receive as unknown as ReceiveChannelEventUseCase,
    );
    const result = await recovery.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      hotelId: "8135188",
      fallbackHotelId: "8135188",
    });
    expect(result.isSuccess).toBe(true);
    expect(receive.execute).toHaveBeenCalled();
    for (const call of receive.execute.mock.calls) {
      expect(call[0]).toMatchObject({
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        ingressKind: "poll",
      });
    }
  });

  it("redacts PaymentCard / VCC material before inbox payload persistence", () => {
    const dirty = `<?xml version="1.0"?>
<OTA_HotelResNotifRQ>
  <HotelReservation ResStatus="Commit" CreateDateTime="2026-09-22T10:00:00Z">
    <UniqueID Type="14" ID="999"/>
    <BasicPropertyInfo HotelCode="8135188"/>
    <RoomStay>
      <RoomType RoomTypeCode="1000202"/>
      <TimeSpan Start="2026-10-01" End="2026-10-05"/>
    </RoomStay>
    <Guarantee>
      <GuaranteesAccepted>
        <GuaranteeAccepted>
          <PaymentCard CardType="1" CardNumber="4111111111111111" SeriesCode="123" ExpireDate="1228">
            <CardHolderName>Ada Lovelace</CardHolderName>
          </PaymentCard>
        </GuaranteeAccepted>
      </GuaranteesAccepted>
    </Guarantee>
  </HotelReservation>
</OTA_HotelResNotifRQ>`;

    expect(bookingComXmlContainedPaymentMaterial(dirty)).toBe(true);
    const redacted = redactBookingComSensitiveReservationXml(dirty);
    expect(redacted).not.toMatch(/4111111111111111/);
    expect(redacted).not.toMatch(/SeriesCode="123"/);
    expect(redacted).toMatch(/REDACTED:PaymentCard/);

    const message = mapParsedBookingComReservationToProviderMessage({
      parsed: parseBookingComReservationXml(dirty),
      connectionId: CONNECTION_ID,
      providerMessageId: "m-pay",
    });
    expect(String(message.payload.rawXml ?? "")).not.toMatch(/4111111111111111/);
  });

  it("Receive persists redacted XML only", async () => {
    const inboxRepository = new InMemoryChannelInboxRepository();
    let seq = 0;
    const enqueueJob = {
      execute: vi.fn(async () => Result.ok({ id: "job-1" })),
    };
    const receive = new ReceiveChannelEventUseCase(
      inboxRepository,
      enqueueJob as never,
      { generate: () => `inbox-${++seq}` },
    );
    const dirty = `<?xml version="1.0"?>
<OTA_HotelResNotifRQ>
  <HotelReservation ResStatus="Commit" CreateDateTime="2026-09-22T10:00:00Z">
    <UniqueID Type="14" ID="555"/>
    <BasicPropertyInfo HotelCode="8135188"/>
    <RoomStay>
      <RoomType RoomTypeCode="1000202"/>
      <TimeSpan Start="2026-10-01" End="2026-10-03"/>
    </RoomStay>
    <PaymentCard CardNumber="4000000000000002" SeriesCode="999"/>
  </HotelReservation>
</OTA_HotelResNotifRQ>`;
    const message = mapParsedBookingComReservationToProviderMessage({
      parsed: parseBookingComReservationXml(dirty),
      connectionId: CONNECTION_ID,
      providerMessageId: "m-recv",
    });
    const result = await receive.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      ingressKind: "poll",
      message,
    });
    expect(result.isSuccess).toBe(true);
    const stored = await inboxRepository.findById(
      TENANT_A,
      result.getValue().inboxItemId,
    );
    const rawPayload = stored?.rawPayload as Record<string, unknown> | undefined;
    const payload = rawPayload?.payload as Record<string, unknown> | undefined;
    expect(String(payload?.rawXml ?? "")).not.toMatch(/4000000000000002/);
  });
});

describe("CM-4c certification red-team — confirm fail-closed + multi-property scale", () => {
  it("does not consume confirmation token when every projection is rejected", async () => {
    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    const outbox = new MemoryOutbox();
    const ledger = new InMemoryBookingComAriPushLedger();
    await connections.create(
      ChannelConnection.createDraft({
        id: CONNECTION_ID,
        tenantId: TENANT_A,
        provider: "booking_com",
        displayName: "Booking.com",
      }),
    );

    const request = new RequestBookingComAriPropagationUseCase(
      connections,
      mappings,
      outbox as never,
      ledger,
    );
    const previews = {
      findPendingByToken: vi.fn(async () => ({
        id: "preview-1",
        mappingConfigGeneration: 1,
        talosStateFingerprint: "talos",
        remoteSnapshotFingerprint: "remote",
        summary: { from: "2026-10-01", to: "2026-10-02" },
      })),
      markConfirmed: vi.fn(async () => {}),
    };
    const setups = {
      get: vi.fn(async () => ({
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        mappingConfigGeneration: 1,
        setup: {
          hotelId: "8135188",
          pricingModel: "Standard",
          approvedConnectionTypes: ["Reservations", "AVAILABILITY"],
          mappingReady: true,
          initialSyncReady: false,
          setupProgress: "sync_preview",
        },
      })),
      upsert: vi.fn(async () => {}),
    };

    const confirm = new ConfirmBookingComInitialSyncUseCase(
      connections,
      setups as never,
      previews as never,
      request,
    );

    const projection = projectAvailabilityDeltaToBookingCom({
      delta: {
        tenantId: TENANT_A,
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

    const result = await confirm.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      confirmationToken: "tok",
      mappingConfigGeneration: 1,
      talosStateFingerprint: "talos",
      remoteSnapshotFingerprint: "remote",
      from: "2026-10-01",
      to: "2026-10-02",
      projectionsToEnqueue: [projection],
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/could not enqueue/i);
    expect(previews.markConfirmed).not.toHaveBeenCalled();
  });

  it("ARI job volume scales linearly for 10 / 20 / 50 properties × 12 months", async () => {
    const from = "2026-01-01";
    const to = addDays(from, 365);
    const months = enumerateMonthKeys(from, to);
    expect(months.length).toBeGreaterThanOrEqual(12);

    async function scheduleForPropertyCount(n: number): Promise<number> {
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

      for (let i = 0; i < n; i += 1) {
        const tenantId = `550e8400-e29b-41d4-a716-${uuidSuffix(0x1000 + i)}`;
        const connectionId = `550e8400-e29b-41d4-a716-${uuidSuffix(0x2000 + i)}`;
        const mappingId = `550e8400-e29b-41d4-a716-${uuidSuffix(0x3000 + i)}`;
        await seedActive(connections, mappings, {
          tenantId,
          connectionId,
          mappingId,
        });
        const projection = projectAvailabilityDeltaToBookingCom({
          delta: {
            tenantId,
            unitId: `unit-${i}`,
            connectionId,
            mappingId,
            from,
            to,
            revision: 1,
            roomsToSell: 1,
            closed: 0,
          },
          hotelId: String(8_000_000 + i),
          roomTypeId: String(1_000_000 + i),
          mappingVersion: 1,
          generation: 1,
        });
        const scheduled = await request.execute({ projection });
        expect(scheduled.getValue().outcome).toBe("scheduled");
      }
      const tenantIds = new Set(outbox.events.map((e) => e.tenantId));
      expect(tenantIds.size).toBe(n);
      return outbox.events.length;
    }

    expect(await scheduleForPropertyCount(10)).toBe(10 * months.length);
    expect(await scheduleForPropertyCount(20)).toBe(20 * months.length);
    expect(await scheduleForPropertyCount(50)).toBe(50 * months.length);
  });
});

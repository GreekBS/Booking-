import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ChannelConnection,
  ChannelListingMapping,
  ChannelProductMapping,
  ChannelUnitSyncOutboxHandler,
  CredentialReference,
  InMemoryBookingComAriPushLedger,
  InMemoryChannelConnectionRepository,
  InMemoryChannelListingMappingRepository,
  InMemoryChannelProductMappingRepository,
  PropagateChannelUnitSyncUseCase,
  RequestBookingComAriPropagationUseCase,
  nightIsSellable,
  projectTalosUnitAriSnapshot,
  shouldSuppressChannelOutboundEcho,
  UNIT_EXTERNAL_SYNC_REQUIRED_EVENT_TYPE,
} from "../../../src/channels";
import {
  mutationOriginChannel,
  mutationOriginDirect,
  mutationOriginOperator,
} from "../../../src/shared/types/MutationOrigin";
import type { DomainEvent } from "../../../src/shared/kernel/DomainEvent";
import type { OutboxEntry } from "../../../src/shared/types/index";
import type {
  ActiveCalendarBlock,
  RatePlanProps,
  UnitAvailabilityRulesProps,
} from "../../../src/commerce/shared/types/CommerceTypes";

const TENANT = "550e8400-e29b-41d4-a716-446655440900";
const CONN_A = "550e8400-e29b-41d4-a716-446655440901";
const CONN_B = "550e8400-e29b-41d4-a716-446655440902";
const UNIT = "550e8400-e29b-41d4-a716-446655440910";
const PROPERTY = "550e8400-e29b-41d4-a716-446655440911";
const MAP_A = "550e8400-e29b-41d4-a716-446655440920";
const MAP_B = "550e8400-e29b-41d4-a716-446655440921";

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

const EMPTY_BLOCKS: ActiveCalendarBlock[] = [];
const RATE_PLAN: RatePlanProps = {
  currency: "EUR",
  baseNightlyAmount: "120.00",
  seasons: [],
  dowModifiers: [],
  losDiscounts: [],
};
const RULES: UnitAvailabilityRulesProps = {
  minNights: 2,
  maxNights: 14,
  checkInDays: [5, 6],
  checkOutDays: [0, 1],
  advanceMinDays: 0,
  advanceMaxDays: 365,
  turnoverNights: 0,
};

class FakeCalendarBlocks {
  blocks: ActiveCalendarBlock[] = [];
  async findActiveBlocks(): Promise<ActiveCalendarBlock[]> {
    return this.blocks;
  }
}
class FakeRatePlans {
  plan: RatePlanProps | null = RATE_PLAN;
  async findByUnitId(): Promise<RatePlanProps | null> {
    return this.plan;
  }
}
class FakeRules {
  rules: UnitAvailabilityRulesProps | null = RULES;
  async findByUnitId(): Promise<UnitAvailabilityRulesProps | null> {
    return this.rules;
  }
}

async function seedConnection(
  connections: InMemoryChannelConnectionRepository,
  mappings: InMemoryChannelListingMappingRepository,
  id: string,
  mappingId: string,
  status: "active" | "paused" | "disconnected" = "active",
): Promise<void> {
  const draft = ChannelConnection.createDraft({
    id,
    tenantId: TENANT,
    provider: "booking_com",
    displayName: `BCom ${id.slice(-4)}`,
  });
  draft.attachCredentials(CredentialReference.create(`cred-${id.slice(-4)}`));
  await connections.create(draft);
  const loaded = await connections.findById(TENANT, id);
  if (status === "disconnected") {
    loaded!.disconnect();
    await connections.disconnectWithExpectedSemanticVersion(
      loaded!,
      loaded!.semanticConfigVersion,
      "pending_auth",
    );
    return;
  }

  loaded!.activate();
  await connections.activateWithExpectedSemanticVersion(
    loaded!,
    loaded!.semanticConfigVersion,
    "pending_auth",
  );

  if (status === "paused") {
    const active = await connections.findById(TENANT, id);
    const version = active!.semanticConfigVersion;
    active!.pause();
    await connections.pauseWithExpectedSemanticVersion(active!, version, "active");
  }

  const mapping = ChannelListingMapping.createActive({
    id: mappingId,
    tenantId: TENANT,
    connectionId: id,
    propertyId: PROPERTY,
    unitId: UNIT,
    externalListingId: "8135188",
    externalUnitId: "1000202",
    syncDirection: "bidirectional",
  });
  await mappings.save(mapping);
}

function buildPropagate(deps: {
  connections: InMemoryChannelConnectionRepository;
  mappings: InMemoryChannelListingMappingRepository;
  outbox: MemoryOutbox;
  blocks?: FakeCalendarBlocks;
  rates?: FakeRatePlans;
  rules?: FakeRules;
  products?: InMemoryChannelProductMappingRepository | null;
}) {
  const ledger = new InMemoryBookingComAriPushLedger();
  const request = new RequestBookingComAriPropagationUseCase(
    deps.connections,
    deps.mappings,
    deps.outbox as never,
    ledger,
    deps.products ?? null,
  );
  return new PropagateChannelUnitSyncUseCase(
    deps.connections,
    deps.mappings,
    deps.products ?? null,
    request,
    (deps.blocks ?? new FakeCalendarBlocks()) as never,
    (deps.rates ?? new FakeRatePlans()) as never,
    (deps.rules ?? new FakeRules()) as never,
  );
}

describe("Final engineering closure — Commerce → Channels fan-out", () => {
  it("DIRECT booking fans out availability to all eligible active connections", async () => {
    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    const outbox = new MemoryOutbox();
    await seedConnection(connections, mappings, CONN_A, MAP_A);
    await seedConnection(connections, mappings, CONN_B, MAP_B);

    const propagate = buildPropagate({ connections, mappings, outbox });
    const result = await propagate.execute({
      tenantId: TENANT,
      unitId: UNIT,
      propertyId: PROPERTY,
      from: "2026-10-10",
      to: "2026-10-13",
      changeKinds: ["availability"],
      mutationOrigin: mutationOriginDirect(),
      revision: 1,
      sourceEventId: "evt-direct-1",
    });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().scheduled).toBeGreaterThanOrEqual(2);
    expect(result.getValue().suppressed).toBe(0);
    expect(outbox.events.length).toBeGreaterThanOrEqual(2);
  });

  it("Booking.com-origin create suppresses originating connection only", async () => {
    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    const outbox = new MemoryOutbox();
    await seedConnection(connections, mappings, CONN_A, MAP_A);
    await seedConnection(connections, mappings, CONN_B, MAP_B);

    const propagate = buildPropagate({ connections, mappings, outbox });
    const origin = mutationOriginChannel({
      provider: "booking_com",
      connectionId: CONN_A,
      externalReservationId: "ext-1",
    });
    const result = await propagate.execute({
      tenantId: TENANT,
      unitId: UNIT,
      propertyId: PROPERTY,
      from: "2026-10-10",
      to: "2026-10-13",
      changeKinds: ["availability"],
      mutationOrigin: origin,
      revision: 2,
      sourceEventId: "evt-channel-create",
    });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().suppressed).toBeGreaterThanOrEqual(1);
    expect(result.getValue().scheduled).toBeGreaterThanOrEqual(1);
    const scheduledConnIds = outbox.events.map(
      (e) => e.payload.connectionId as string,
    );
    expect(scheduledConnIds).not.toContain(CONN_A);
    expect(scheduledConnIds).toContain(CONN_B);
  });

  it("two Booking.com connections — suppression is connection-specific", () => {
    const origin = mutationOriginChannel({
      provider: "booking_com",
      connectionId: CONN_A,
    });
    expect(
      shouldSuppressChannelOutboundEcho({
        outboundProvider: "booking_com",
        outboundConnectionId: CONN_A,
        mutationOrigin: origin,
      }),
    ).toBe(true);
    expect(
      shouldSuppressChannelOutboundEcho({
        outboundProvider: "booking_com",
        outboundConnectionId: CONN_B,
        mutationOrigin: origin,
      }),
    ).toBe(false);
  });

  it("later OPERATOR mutation on channel-origin booking is NOT suppressed", async () => {
    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    const outbox = new MemoryOutbox();
    await seedConnection(connections, mappings, CONN_A, MAP_A);

    const propagate = buildPropagate({ connections, mappings, outbox });
    const result = await propagate.execute({
      tenantId: TENANT,
      unitId: UNIT,
      propertyId: PROPERTY,
      from: "2026-11-01",
      to: "2026-11-05",
      changeKinds: ["availability"],
      mutationOrigin: mutationOriginOperator(),
      revision: 3,
      sourceEventId: "evt-operator-later",
    });
    expect(result.getValue().suppressed).toBe(0);
    expect(result.getValue().scheduled).toBeGreaterThanOrEqual(1);
  });

  it("paused / disconnected connections receive no propagation", async () => {
    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    const outbox = new MemoryOutbox();
    await seedConnection(connections, mappings, CONN_A, MAP_A, "paused");
    await seedConnection(connections, mappings, CONN_B, MAP_B, "disconnected");

    const propagate = buildPropagate({ connections, mappings, outbox });
    const result = await propagate.execute({
      tenantId: TENANT,
      unitId: UNIT,
      propertyId: PROPERTY,
      from: "2026-10-01",
      to: "2026-10-02",
      changeKinds: ["availability"],
      mutationOrigin: mutationOriginDirect(),
      revision: 4,
      sourceEventId: "evt-paused",
    });
    expect(result.getValue().scheduled).toBe(0);
    expect(outbox.events).toHaveLength(0);
  });

  it("rate and restriction deltas fan out independently", async () => {
    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    const products = new InMemoryChannelProductMappingRepository();
    const outbox = new MemoryOutbox();
    await seedConnection(connections, mappings, CONN_A, MAP_A);

    const product = ChannelProductMapping.createActive({
      id: "550e8400-e29b-41d4-a716-446655440930",
      tenantId: TENANT,
      connectionId: CONN_A,
      provider: "booking_com",
      kind: "room_rate",
      unitId: UNIT,
      propertyId: PROPERTY,
      ratePlanId: "550e8400-e29b-41d4-a716-446655440940",
      externalHotelId: "8135188",
      externalRoomTypeId: "1000202",
      externalRatePlanId: "2000001",
      mappingConfigGeneration: 1,
    });
    await products.save(product);

    const propagate = buildPropagate({
      connections,
      mappings,
      outbox,
      products,
    });
    const rates = await propagate.execute({
      tenantId: TENANT,
      unitId: UNIT,
      propertyId: PROPERTY,
      from: "2026-11-05",
      to: "2026-11-06",
      changeKinds: ["rates"],
      mutationOrigin: mutationOriginOperator(),
      revision: 5,
      sourceEventId: "evt-rate",
    });
    expect(rates.getValue().scheduled).toBeGreaterThanOrEqual(1);

    const restrictions = await propagate.execute({
      tenantId: TENANT,
      unitId: UNIT,
      propertyId: PROPERTY,
      from: "2026-12-01",
      to: "2026-12-06",
      changeKinds: ["restrictions"],
      mutationOrigin: mutationOriginOperator(),
      revision: 6,
      sourceEventId: "evt-restriction",
    });
    expect(restrictions.getValue().scheduled).toBeGreaterThanOrEqual(1);
  });

  it("ChannelUnitSyncOutboxHandler preserves provenance end-to-end", async () => {
    const connections = new InMemoryChannelConnectionRepository();
    const mappings = new InMemoryChannelListingMappingRepository();
    const outbox = new MemoryOutbox();
    await seedConnection(connections, mappings, CONN_A, MAP_A);
    await seedConnection(connections, mappings, CONN_B, MAP_B);

    const propagate = buildPropagate({ connections, mappings, outbox });
    const handler = new ChannelUnitSyncOutboxHandler(propagate);

    const entry: OutboxEntry = {
      id: "outbox-1",
      eventType: "BookingCreated",
      aggregateType: "Booking",
      aggregateId: "booking-1",
      tenantId: TENANT,
      payload: {
        unitId: UNIT,
        propertyId: PROPERTY,
        checkIn: "2026-10-10",
        checkOut: "2026-10-13",
        mutationOrigin: {
          kind: "channel",
          channel: {
            provider: "booking_com",
            connectionId: CONN_A,
            externalReservationId: "ext-99",
          },
        },
      },
      status: "pending",
      attemptCount: 0,
    };

    await handler.handle(entry);
    const scheduledConnIds = outbox.events.map(
      (e) => e.payload.connectionId as string,
    );
    expect(scheduledConnIds).not.toContain(CONN_A);
    expect(scheduledConnIds).toContain(CONN_B);
  });

  it("UnitExternalSyncRequired identity contract exists for idempotent fan-out", () => {
    expect(UNIT_EXTERNAL_SYNC_REQUIRED_EVENT_TYPE).toBe("UnitExternalSyncRequired");
  });
});

describe("Final engineering closure — real Talos ARI projection", () => {
  it("confirmed booking block reduces roomsToSell exactly once", () => {
    const blocks: ActiveCalendarBlock[] = [
      {
        blockType: "booking",
        status: "active",
        checkIn: "2026-10-10",
        checkOut: "2026-10-13",
        sourceId: "booking-1",
      },
    ];
    expect(nightIsSellable("2026-10-10", blocks)).toBe(false);
    expect(nightIsSellable("2026-10-12", blocks)).toBe(false);
    expect(nightIsSellable("2026-10-13", blocks)).toBe(true);

    const snapshot = projectTalosUnitAriSnapshot({
      hotelId: "8135188",
      roomTypeId: "1000202",
      ratePlanId: "2000001",
      from: "2026-10-10",
      to: "2026-10-14",
      activeBlocks: blocks,
      ratePlan: RATE_PLAN,
      rules: RULES,
    });
    const booked = snapshot.nights.filter((n) => n.date < "2026-10-13");
    expect(booked.every((n) => n.roomsToSell === 0 && n.closed === 1)).toBe(true);
    expect(snapshot.nights.find((n) => n.date === "2026-10-13")?.roomsToSell).toBe(1);
  });

  it("hold and manual block follow authoritative unavailable semantics", () => {
    const blocks: ActiveCalendarBlock[] = [
      {
        blockType: "hold",
        status: "active",
        checkIn: "2026-10-01",
        checkOut: "2026-10-03",
        sourceId: "hold-1",
      },
      {
        blockType: "manual",
        status: "active",
        checkIn: "2026-10-05",
        checkOut: "2026-10-07",
        sourceId: null,
      },
    ];
    expect(nightIsSellable("2026-10-01", blocks)).toBe(false);
    expect(nightIsSellable("2026-10-05", blocks)).toBe(false);
    expect(nightIsSellable("2026-10-04", blocks)).toBe(true);
  });

  it("projects real nightly price and min/max/CTA/CTD from Talos engines", () => {
    const snapshot = projectTalosUnitAriSnapshot({
      hotelId: "8135188",
      roomTypeId: "1000202",
      ratePlanId: "2000001",
      from: "2026-10-02",
      to: "2026-10-04",
      activeBlocks: EMPTY_BLOCKS,
      ratePlan: RATE_PLAN,
      rules: RULES,
    });
    expect(snapshot.nights[0]!.price).toBe("120.0000");
    expect(snapshot.nights[0]!.minStay).toBe(2);
    expect(snapshot.nights[0]!.maxStay).toBe(14);
    expect(snapshot.nights[0]!.closedToArrival).toBe(false);
    const saturday = snapshot.nights.find((n) => n.date === "2026-10-03");
    expect(saturday?.closedToDeparture).toBe(true);
  });

  it("does not leave placeholder roomsToSell=1 / price=100 in production initial-sync path", () => {
    const route = readFileSync(
      join(
        process.cwd(),
        "..",
        "..",
        "apps",
        "web",
        "app",
        "api",
        "admin",
        "v1",
        "channel-connections",
        "[connectionId]",
        "booking-com",
        "initial-sync",
        "route.ts",
      ),
      "utf8",
    );
    expect(route).toMatch(/projectTalosUnitAriSnapshot/);
    expect(route).not.toMatch(/roomsToSell:\s*1/);
    expect(route).not.toMatch(/price:\s*100/);

    const localAri = readFileSync(
      join(process.cwd(), "..", "..", "apps", "web", "lib", "channels", "booking-com-local-ari.ts"),
      "utf8",
    );
    expect(localAri).toMatch(/projectTalosUnitAriSnapshot/);
    expect(localAri).toMatch(/No placeholder cells/);
  });
});

describe("Final engineering closure — architecture fitness", () => {
  it("Commerce does not import Booking.com adapters", () => {
    const commerceRoot = join(process.cwd(), "src", "commerce");
    const files = [
      "application/CommerceUseCases.ts",
      "application/CreateReservationUseCase.ts",
      "application/PrepareReservationUseCase.ts",
      "application/ChangeBookingStayUseCase.ts",
    ];
    for (const rel of files) {
      const source = readFileSync(join(commerceRoot, rel), "utf8");
      expect(source).not.toMatch(/providers\/booking_com/);
      expect(source).not.toMatch(/BookingComAri/);
      expect(source).not.toMatch(/RequestBookingComAri/);
    }
  });

  it("DI registers ChannelUnitSyncOutboxHandler before LoggingHandler", () => {
    const di = readFileSync(
      join(process.cwd(), "..", "..", "apps", "web", "lib", "di", "container.ts"),
      "utf8",
    );
    const syncIdx = di.indexOf("new ChannelUnitSyncOutboxHandler");
    const logIdx = di.lastIndexOf("new LoggingHandler()");
    expect(syncIdx).toBeGreaterThan(0);
    expect(logIdx).toBeGreaterThan(syncIdx);
  });

  it("iCal remains capability-filtered out of ARI outbound", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "channels", "application", "PropagateChannelUnitSyncUseCase.ts"),
      "utf8",
    );
    expect(source).toMatch(/providerSupportsAriOutbound/);
    expect(source).toMatch(/provider === "booking_com"/);
  });
});

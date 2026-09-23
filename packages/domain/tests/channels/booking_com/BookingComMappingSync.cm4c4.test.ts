import { describe, expect, it } from "vitest";
import {
  ActivateChannelConnectionUseCase,
  BookingComActivationGate,
  ChannelConnection,
  ChannelListingMapping,
  ChannelProductMapping,
  ChannelProviderRegistry,
  ConfirmBookingComInitialSyncUseCase,
  CredentialReference,
  DiscoverBookingComRemoteConfigUseCase,
  FakeBookingComRemoteAriReader,
  FakeBookingComRemoteDiscoveryClient,
  GenerateBookingComInitialSyncPreviewUseCase,
  InMemoryBookingComAriPushLedger,
  InMemoryChannelConnectionLifecycleUnitOfWork,
  InMemoryChannelConnectionProviderSetupRepository,
  InMemoryChannelConnectionRepository,
  InMemoryChannelInitialSyncPreviewRepository,
  InMemoryChannelListingMappingRepository,
  InMemoryChannelProductMappingRepository,
  InMemoryChannelReconciliationRunRepository,
  InMemoryLifecycleAuditLog,
  ReconcileBookingComConnectionUseCase,
  RequestBookingComAriPropagationUseCase,
  UpsertChannelProductMappingUseCase,
  ValidateBookingComMappingsUseCase,
  createBookingComProviderRegistration,
  createDefaultBookingComConnectionSetup,
  defaultFixtureSnapshot,
  diffBookingComAriState,
  fingerprintTalosAriCells,
  projectAvailabilityDeltaToBookingCom,
  shouldSuppressChannelOutboundEcho,
  validateBookingComMappings,
  type BookingComAriResolvedProjection,
} from "../../../src/channels";
import { PermissionChecker } from "../../../src/shared/services/PermissionChecker";
import type { DomainEvent } from "../../../src/shared/kernel/DomainEvent";
import type { OutboxEntry } from "../../../src/shared/types/index";
import type { IIdGenerator } from "../../../src/shared/ports/IIdGenerator";

const TENANT_A = "550e8400-e29b-41d4-a716-446655440900";
const TENANT_B = "550e8400-e29b-41d4-a716-446655440999";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440901";
const LISTING_MAPPING_ID = "550e8400-e29b-41d4-a716-446655440902";
const ACTOR_ID = "550e8400-e29b-41d4-a716-446655440010";
const HOTEL = "8135188";
const ROOM = "1000202";
const RATE = "12345";

class SeqIdGenerator implements IIdGenerator {
  private n = 0;
  generate(): string {
    this.n += 1;
    return `550e8400-e29b-41d4-a716-${String(this.n).padStart(12, "0")}`;
  }
}

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

async function seedPendingBookingConnection(
  connections: InMemoryChannelConnectionRepository,
  listings: InMemoryChannelListingMappingRepository,
  tenantId = TENANT_A,
): Promise<void> {
  const draft = ChannelConnection.createDraft({
    id: CONNECTION_ID,
    tenantId,
    provider: "booking_com",
    displayName: "Booking.com",
  });
  draft.attachCredentials(CredentialReference.create("cred-1"));
  await connections.create(draft);

  const listing = ChannelListingMapping.createActive({
    id: LISTING_MAPPING_ID,
    tenantId,
    connectionId: CONNECTION_ID,
    externalListingId: HOTEL,
    externalUnitId: ROOM,
    propertyId: "prop-1",
    unitId: "unit-1",
    syncDirection: "bidirectional",
  });
  await listings.save(listing);
}

function buildStack() {
  const connections = new InMemoryChannelConnectionRepository();
  const listings = new InMemoryChannelListingMappingRepository();
  const products = new InMemoryChannelProductMappingRepository();
  const setups = new InMemoryChannelConnectionProviderSetupRepository();
  const previews = new InMemoryChannelInitialSyncPreviewRepository();
  const runs = new InMemoryChannelReconciliationRunRepository();
  const ledger = new InMemoryBookingComAriPushLedger();
  const outbox = new MemoryOutbox();
  const ids = new SeqIdGenerator();
  const discovery = new FakeBookingComRemoteDiscoveryClient();
  const remoteAri = new FakeBookingComRemoteAriReader({
    hotelId: HOTEL,
    from: "2026-10-01",
    to: "2026-10-03",
    fingerprint: "remote-fp-1",
    cells: [
      {
        hotelId: HOTEL,
        roomTypeId: ROOM,
        ratePlanId: RATE,
        date: "2026-10-01",
        field: "roomstosell",
        value: 0,
      },
      {
        hotelId: HOTEL,
        roomTypeId: ROOM,
        ratePlanId: RATE,
        date: "2026-10-01",
        field: "price",
        value: 80,
      },
    ],
  });

  const requestAri = new RequestBookingComAriPropagationUseCase(
    connections,
    listings,
    outbox,
    ledger,
    products,
  );

  const validate = new ValidateBookingComMappingsUseCase(
    connections,
    setups,
    products,
    discovery,
  );

  const upsert = new UpsertChannelProductMappingUseCase(
    connections,
    setups,
    products,
    ids,
  );

  const preview = new GenerateBookingComInitialSyncPreviewUseCase(
    connections,
    setups,
    products,
    previews,
    remoteAri,
    validate,
    ids,
  );

  const confirm = new ConfirmBookingComInitialSyncUseCase(
    connections,
    setups,
    previews,
    requestAri,
  );

  const reconcile = new ReconcileBookingComConnectionUseCase(
    connections,
    setups,
    products,
    runs,
    discovery,
    remoteAri,
    null,
    requestAri,
    ids,
  );

  const discover = new DiscoverBookingComRemoteConfigUseCase(
    connections,
    setups,
    discovery,
  );

  const gate = new BookingComActivationGate(setups);
  const registry = new ChannelProviderRegistry();
  registry.register(createBookingComProviderRegistration());
  const activate = new ActivateChannelConnectionUseCase(
    connections,
    registry,
    new PermissionChecker(),
    new InMemoryChannelConnectionLifecycleUnitOfWork(
      connections,
      new InMemoryLifecycleAuditLog(),
    ),
    null,
    gate,
  );

  return {
    connections,
    listings,
    products,
    setups,
    previews,
    runs,
    ledger,
    outbox,
    upsert,
    validate,
    preview,
    confirm,
    reconcile,
    discover,
    activate,
    requestAri,
    remoteAri,
    ids,
  };
}

async function seedFullMappings(
  upsert: UpsertChannelProductMappingUseCase,
  tenantId = TENANT_A,
): Promise<{ roomRateMappingId: string; mappingVersion: number }> {
  await upsert.execute({
    tenantId,
    connectionId: CONNECTION_ID,
    kind: "property_hotel",
    propertyId: "prop-1",
    externalHotelId: HOTEL,
  });
  await upsert.execute({
    tenantId,
    connectionId: CONNECTION_ID,
    kind: "unit_room",
    propertyId: "prop-1",
    unitId: "unit-1",
    externalHotelId: HOTEL,
    externalRoomTypeId: ROOM,
  });
  await upsert.execute({
    tenantId,
    connectionId: CONNECTION_ID,
    kind: "rate_plan",
    unitId: "unit-1",
    ratePlanId: "rate-1",
    externalHotelId: HOTEL,
    externalRatePlanId: RATE,
  });
  const roomRate = await upsert.execute({
    tenantId,
    connectionId: CONNECTION_ID,
    kind: "room_rate",
    unitId: "unit-1",
    ratePlanId: "rate-1",
    externalHotelId: HOTEL,
    externalRoomTypeId: ROOM,
    externalRatePlanId: RATE,
  });
  expect(roomRate.isSuccess).toBe(true);
  return {
    roomRateMappingId: roomRate.getValue().mappingId,
    mappingVersion: roomRate.getValue().mappingVersion,
  };
}

const unitPropertyIds = new Map([["unit-1", "prop-1"]]);
const activeUnits = ["unit-1"];
const activeRates = ["rate-1"];

function localCells() {
  return [
    {
      hotelId: HOTEL,
      roomTypeId: ROOM,
      ratePlanId: RATE,
      date: "2026-10-01",
      field: "roomstosell" as const,
      local: 2,
      remote: null,
    },
    {
      hotelId: HOTEL,
      roomTypeId: ROOM,
      ratePlanId: RATE,
      date: "2026-10-01",
      field: "price" as const,
      local: 120,
      remote: null,
    },
  ];
}

function projectionFor(
  mappingId: string,
  mappingVersion: number,
): BookingComAriResolvedProjection {
  return projectAvailabilityDeltaToBookingCom({
    delta: {
      tenantId: TENANT_A,
      unitId: "unit-1",
      connectionId: CONNECTION_ID,
      mappingId,
      from: "2026-10-01",
      to: "2026-10-03",
      revision: 1,
      roomsToSell: 2,
      closed: 0,
    },
    hotelId: HOTEL,
    roomTypeId: ROOM,
    mappingVersion,
    generation: 1,
  });
}

describe("CM-4c-4 — product mapping invariants", () => {
  it("maps property / room / rate / roomrate and bumps generation", async () => {
    const stack = buildStack();
    await seedPendingBookingConnection(stack.connections, stack.listings);
    await seedFullMappings(stack.upsert);
    const setup = await stack.setups.get(TENANT_A, CONNECTION_ID);
    expect(setup?.mappingConfigGeneration).toBe(4);
    expect(setup?.setup).toMatchObject({ hotelId: HOTEL });

    const listed = await stack.products.listByConnection(TENANT_A, CONNECTION_ID);
    expect(listed.filter((m) => m.status === "active").length).toBe(4);

    const bump = await stack.upsert.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      kind: "unit_room",
      propertyId: "prop-1",
      unitId: "unit-1",
      externalHotelId: HOTEL,
      externalRoomTypeId: ROOM,
      mappingId: listed.find((m) => m.kind === "unit_room")!.id,
    });
    expect(bump.getValue().mappingConfigGeneration).toBe(5);
  });

  it("rejects duplicate remote room mapping at validation", async () => {
    const stack = buildStack();
    await seedPendingBookingConnection(stack.connections, stack.listings);
    await seedFullMappings(stack.upsert);
    const gen = (await stack.setups.get(TENANT_A, CONNECTION_ID))!.mappingConfigGeneration;
    const dup = ChannelProductMapping.createActive({
      id: stack.ids.generate(),
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      provider: "booking_com",
      kind: "unit_room",
      propertyId: "prop-1",
      unitId: "unit-2",
      externalHotelId: HOTEL,
      externalRoomTypeId: ROOM,
      mappingConfigGeneration: gen,
    });
    await stack.products.save(dup);

    const result = validateBookingComMappings({
      mappings: await stack.products.listByConnection(TENANT_A, CONNECTION_ID),
      expectedPropertyId: "prop-1",
      activeUnitIds: new Set(["unit-1", "unit-2"]),
      activeRatePlanIds: new Set(["rate-1"]),
      unitPropertyIds: new Map([
        ["unit-1", "prop-1"],
        ["unit-2", "prop-1"],
      ]),
      pricingModel: "Standard",
      expectedMappingConfigGeneration: gen,
      discovery: null,
    });
    expect(result.ok).toBe(false);
    expect(result.blocking.some((b) => b.code === "DUPLICATE_REMOTE_MAPPING")).toBe(
      true,
    );
  });

  it("rejects cross-tenant / wrong-property / inactive unit & rate", async () => {
    const stack = buildStack();
    await seedPendingBookingConnection(stack.connections, stack.listings);
    await seedFullMappings(stack.upsert);

    const otherTenant = await stack.products.findById(
      TENANT_B,
      (await stack.products.listByConnection(TENANT_A, CONNECTION_ID))[0]!.id,
    );
    expect(otherTenant).toBeNull();

    const wrongProp = validateBookingComMappings({
      mappings: await stack.products.listByConnection(TENANT_A, CONNECTION_ID),
      expectedPropertyId: "prop-OTHER",
      activeUnitIds: new Set(activeUnits),
      activeRatePlanIds: new Set(activeRates),
      unitPropertyIds,
      pricingModel: "Standard",
      expectedMappingConfigGeneration: null,
      discovery: null,
    });
    expect(wrongProp.blocking.some((b) => b.code === "WRONG_PROPERTY")).toBe(true);

    const inactive = validateBookingComMappings({
      mappings: await stack.products.listByConnection(TENANT_A, CONNECTION_ID),
      expectedPropertyId: "prop-1",
      activeUnitIds: new Set(),
      activeRatePlanIds: new Set(),
      unitPropertyIds,
      pricingModel: "Standard",
      expectedMappingConfigGeneration: null,
      discovery: null,
    });
    expect(inactive.blocking.some((b) => b.code === "INACTIVE_UNIT")).toBe(true);
    expect(inactive.blocking.some((b) => b.code === "INACTIVE_RATE_PLAN")).toBe(true);
  });

  it("detects stale mapping generation", async () => {
    const stack = buildStack();
    await seedPendingBookingConnection(stack.connections, stack.listings);
    await seedFullMappings(stack.upsert);
    const setup = await stack.setups.get(TENANT_A, CONNECTION_ID);
    const result = validateBookingComMappings({
      mappings: await stack.products.listByConnection(TENANT_A, CONNECTION_ID),
      expectedPropertyId: "prop-1",
      activeUnitIds: new Set(activeUnits),
      activeRatePlanIds: new Set(activeRates),
      unitPropertyIds,
      pricingModel: "Standard",
      expectedMappingConfigGeneration: (setup?.mappingConfigGeneration ?? 0) + 10,
      discovery: null,
    });
    expect(result.blocking.some((b) => b.code === "STALE_MAPPING_GENERATION")).toBe(
      true,
    );
  });
});

describe("CM-4c-4 — discovery + validation", () => {
  it("discovers fixture hotel/rooms/rates/roomrates", async () => {
    const stack = buildStack();
    await seedPendingBookingConnection(stack.connections, stack.listings);
    await stack.setups.upsert({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      provider: "booking_com",
      setup: {
        ...createDefaultBookingComConnectionSetup(),
        hotelId: HOTEL,
        setupProgress: "hotel_bound",
      },
      mappingConfigGeneration: 0,
      updatedAt: new Date(),
    });
    const result = await stack.discover.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
    });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual(defaultFixtureSnapshot());
  });

  it("validation returns blocking vs warnings", async () => {
    const stack = buildStack();
    await seedPendingBookingConnection(stack.connections, stack.listings);
    const empty = await stack.validate.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      expectedPropertyId: "prop-1",
      activeUnitIds: activeUnits,
      activeRatePlanIds: activeRates,
      unitPropertyIds,
    });
    expect(empty.isSuccess).toBe(true);
    expect(empty.getValue().ok).toBe(false);
    expect(empty.getValue().blocking.length).toBeGreaterThan(0);

    await seedFullMappings(stack.upsert);
    const ok = await stack.validate.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      expectedPropertyId: "prop-1",
      activeUnitIds: activeUnits,
      activeRatePlanIds: activeRates,
      unitPropertyIds,
      includeDiscovery: true,
    });
    expect(ok.getValue().ok).toBe(true);
  });
});

describe("CM-4c-4 — initial sync preview + confirm", () => {
  it("reads remote, diffs deterministically, and requires confirmation token", async () => {
    const stack = buildStack();
    await seedPendingBookingConnection(stack.connections, stack.listings);
    const { roomRateMappingId, mappingVersion } = await seedFullMappings(stack.upsert);
    const cells = localCells();
    const talosFp = fingerprintTalosAriCells(cells);

    const first = await stack.preview.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      from: "2026-10-01",
      to: "2026-10-03",
      expectedPropertyId: "prop-1",
      activeUnitIds: activeUnits,
      activeRatePlanIds: activeRates,
      unitPropertyIds,
      localCells: cells,
      talosStateFingerprint: talosFp,
    });
    expect(first.isSuccess).toBe(true);
    const preview = first.getValue();
    expect(preview.diff.availabilityChanges).toBeGreaterThan(0);
    expect(preview.diff.priceChanges).toBeGreaterThan(0);
    expect(preview.confirmationToken).toHaveLength(64);

    const second = await stack.preview.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      from: "2026-10-01",
      to: "2026-10-03",
      expectedPropertyId: "prop-1",
      activeUnitIds: activeUnits,
      activeRatePlanIds: activeRates,
      unitPropertyIds,
      localCells: cells,
      talosStateFingerprint: talosFp,
    });
    expect(second.getValue().diff.fingerprint).toBe(preview.diff.fingerprint);

    const stale = await stack.confirm.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      confirmationToken: second.getValue().confirmationToken,
      mappingConfigGeneration: second.getValue().mappingConfigGeneration,
      talosStateFingerprint: "changed",
      remoteSnapshotFingerprint: "remote-fp-1",
      from: "2026-10-01",
      to: "2026-10-03",
      projectionsToEnqueue: [projectionFor(roomRateMappingId, mappingVersion)],
    });
    expect(stale.isFailure).toBe(true);
    expect(stale.getError().message).toMatch(/Stale preview/);

    // Fresh preview after stale reject (prior pending still valid until superseded).
    const third = await stack.preview.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      from: "2026-10-01",
      to: "2026-10-03",
      expectedPropertyId: "prop-1",
      activeUnitIds: activeUnits,
      activeRatePlanIds: activeRates,
      unitPropertyIds,
      localCells: cells,
      talosStateFingerprint: talosFp,
    });

    const ok = await stack.confirm.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      confirmationToken: third.getValue().confirmationToken,
      mappingConfigGeneration: third.getValue().mappingConfigGeneration,
      talosStateFingerprint: talosFp,
      remoteSnapshotFingerprint: "remote-fp-1",
      from: "2026-10-01",
      to: "2026-10-03",
      projectionsToEnqueue: [projectionFor(roomRateMappingId, mappingVersion)],
    });
    expect(ok.isSuccess).toBe(true);
    expect(ok.getValue().enqueued).toBe(1);
    expect(stack.outbox.events.length).toBeGreaterThan(0);

    const setup = await stack.setups.get(TENANT_A, CONNECTION_ID);
    expect(setup?.setup).toMatchObject({
      initialSyncReady: true,
      mappingReady: true,
      setupProgress: "ready_to_activate",
    });
  });

  it("rejects stale confirmation after mapping change", async () => {
    const stack = buildStack();
    await seedPendingBookingConnection(stack.connections, stack.listings);
    const { roomRateMappingId, mappingVersion } = await seedFullMappings(stack.upsert);
    const cells = localCells();
    const talosFp = fingerprintTalosAriCells(cells);
    const preview = await stack.preview.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      from: "2026-10-01",
      to: "2026-10-03",
      expectedPropertyId: "prop-1",
      activeUnitIds: activeUnits,
      activeRatePlanIds: activeRates,
      unitPropertyIds,
      localCells: cells,
      talosStateFingerprint: talosFp,
    });
    const token = preview.getValue().confirmationToken;
    const gen = preview.getValue().mappingConfigGeneration;

    await stack.upsert.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      kind: "unit_room",
      propertyId: "prop-1",
      unitId: "unit-1",
      externalHotelId: HOTEL,
      externalRoomTypeId: "9999999",
    });

    const confirm = await stack.confirm.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      confirmationToken: token,
      mappingConfigGeneration: gen,
      talosStateFingerprint: talosFp,
      remoteSnapshotFingerprint: "remote-fp-1",
      from: "2026-10-01",
      to: "2026-10-03",
      projectionsToEnqueue: [projectionFor(roomRateMappingId, mappingVersion)],
    });
    expect(confirm.isFailure).toBe(true);
  });
});

describe("CM-4c-4 — activation gate", () => {
  it("blocks activation before valid sync and succeeds after", async () => {
    const stack = buildStack();
    await seedPendingBookingConnection(stack.connections, stack.listings);
    const actor = {
      userId: ACTOR_ID,
      role: "admin" as const,
      propertyIds: null,
    };
    const audit = { actorId: actor.userId, ipAddress: "127.0.0.1" };

    const blocked = await stack.activate.execute(
      {
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: 1,
      },
      actor,
      audit,
    );
    expect(blocked.isFailure).toBe(true);

    const { roomRateMappingId, mappingVersion } = await seedFullMappings(stack.upsert);
    const cells = localCells();
    const talosFp = fingerprintTalosAriCells(cells);
    const preview = await stack.preview.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      from: "2026-10-01",
      to: "2026-10-03",
      expectedPropertyId: "prop-1",
      activeUnitIds: activeUnits,
      activeRatePlanIds: activeRates,
      unitPropertyIds,
      localCells: cells,
      talosStateFingerprint: talosFp,
    });
    await stack.confirm.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      confirmationToken: preview.getValue().confirmationToken,
      mappingConfigGeneration: preview.getValue().mappingConfigGeneration,
      talosStateFingerprint: talosFp,
      remoteSnapshotFingerprint: "remote-fp-1",
      from: "2026-10-01",
      to: "2026-10-03",
      projectionsToEnqueue: [projectionFor(roomRateMappingId, mappingVersion)],
    });

    const conn = await stack.connections.findById(TENANT_A, CONNECTION_ID);
    const ok = await stack.activate.execute(
      {
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        expectedSemanticConfigVersion: conn!.semanticConfigVersion,
      },
      actor,
      audit,
    );
    expect(ok.isSuccess).toBe(true);
    expect(ok.getValue().status).toBe("active");
  });
});

describe("CM-4c-4 — reconciliation", () => {
  it("detects ARI drift and auto-heals via CM-4c-3 only when mapping is clean", async () => {
    const stack = buildStack();
    await seedPendingBookingConnection(stack.connections, stack.listings);
    const { roomRateMappingId, mappingVersion } = await seedFullMappings(stack.upsert);
    // Activate so non-initial ARI enqueue is allowed
    await stack.setups.upsert({
      ...(await stack.setups.get(TENANT_A, CONNECTION_ID))!,
      setup: {
        ...createDefaultBookingComConnectionSetup(),
        hotelId: HOTEL,
        mappingReady: true,
        initialSyncReady: true,
        setupProgress: "ready_to_activate",
      },
    });
    const conn = await stack.connections.findById(TENANT_A, CONNECTION_ID);
    conn!.activate();
    await stack.connections.activateWithExpectedSemanticVersion(
      conn!,
      conn!.semanticConfigVersion,
      "pending_auth",
    );

    const result = await stack.reconcile.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      from: "2026-10-01",
      to: "2026-10-03",
      activeUnitIds: activeUnits,
      activeRatePlanIds: activeRates,
      unitPropertyIds,
      localCells: localCells(),
      healProjections: [projectionFor(roomRateMappingId, mappingVersion)],
    });
    expect(result.isSuccess).toBe(true);
    const ari = result.getValue().outcomes.find((o) => o.scope === "ari");
    expect(ari?.outcome).toMatch(/DRIFT|AHEAD|IN_SYNC/);
    expect(ari?.autoHealEnqueued).toBe(true);
  });

  it("never auto-heals mapping drift / ambiguity", async () => {
    const stack = buildStack();
    await seedPendingBookingConnection(stack.connections, stack.listings);
    await seedFullMappings(stack.upsert);
    const gen = (await stack.setups.get(TENANT_A, CONNECTION_ID))!.mappingConfigGeneration;
    await stack.products.save(
      ChannelProductMapping.createActive({
        id: stack.ids.generate(),
        tenantId: TENANT_A,
        connectionId: CONNECTION_ID,
        provider: "booking_com",
        kind: "unit_room",
        propertyId: "prop-1",
        unitId: "unit-2",
        externalHotelId: HOTEL,
        externalRoomTypeId: ROOM,
        mappingConfigGeneration: gen,
      }),
    );

    const result = await stack.reconcile.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      from: "2026-10-01",
      to: "2026-10-03",
      activeUnitIds: ["unit-1", "unit-2"],
      activeRatePlanIds: activeRates,
      unitPropertyIds: new Map([
        ["unit-1", "prop-1"],
        ["unit-2", "prop-1"],
      ]),
      localCells: localCells(),
      healProjections: [],
    });
    const mapping = result.getValue().outcomes.find((o) => o.scope === "mappings");
    expect(mapping?.outcome).toBe("REQUIRES_OPERATOR_ATTENTION");
    expect(mapping?.autoHealEnqueued).toBe(false);
  });

  it("suppresses ARI echo loops and pauses when disconnected", async () => {
    expect(
      shouldSuppressChannelOutboundEcho({
        outboundProvider: "booking_com",
        inboundOriginProvider: "booking_com",
      }),
    ).toBe(true);

    const stack = buildStack();
    await seedPendingBookingConnection(stack.connections, stack.listings);
    const conn = await stack.connections.findById(TENANT_A, CONNECTION_ID);
    conn!.disconnect();
    await stack.connections.disconnectWithExpectedSemanticVersion(
      conn!,
      conn!.semanticConfigVersion,
      "pending_auth",
    );

    const result = await stack.reconcile.execute({
      tenantId: TENANT_A,
      connectionId: CONNECTION_ID,
      from: "2026-10-01",
      to: "2026-10-03",
      activeUnitIds: activeUnits,
      activeRatePlanIds: activeRates,
      unitPropertyIds,
      localCells: [],
    });
    expect(result.getValue().outcomes[0]?.outcome).toBe("PROVIDER_UNAVAILABLE");
  });

  it("diff is deterministic for identical inputs", () => {
    const a = diffBookingComAriState({
      from: "2026-10-01",
      to: "2026-10-02",
      local: localCells(),
      remote: [
        {
          hotelId: HOTEL,
          roomTypeId: ROOM,
          ratePlanId: RATE,
          date: "2026-10-01",
          field: "roomstosell",
          local: null,
          remote: 0,
        },
      ],
    });
    const b = diffBookingComAriState({
      from: "2026-10-01",
      to: "2026-10-02",
      local: localCells(),
      remote: [
        {
          hotelId: HOTEL,
          roomTypeId: ROOM,
          ratePlanId: RATE,
          date: "2026-10-01",
          field: "roomstosell",
          local: null,
          remote: 0,
        },
      ],
    });
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

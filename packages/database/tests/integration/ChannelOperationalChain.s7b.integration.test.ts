/**
 * P1-S7b — focused PostgreSQL operational-chain proof.
 *
 * Proves automation-capable composition through real application paths:
 * ScheduleIcalPollsUseCase → ProcessJobBatchUseCase (poll handler) →
 * ExecuteChannelPollConnectionUseCase → TX1 → outbox →
 * ProcessOutboxBatchUseCase (typed reconcile handler) →
 * ProcessJobBatchUseCase (reconcile handler) → TX2 → active channel_import.
 *
 * ReceiveChannelPollBatchUseCase is stubbed to return a trusted mapped inventory
 * snapshot (same pattern as S6a PG orchestration). That isolates SSRF/network
 * while still exercising the real job → execute → TX1 commit path.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  AvailabilityEvaluator,
  ChannelListingMapping,
  ChannelProviderRegistry,
  EnqueueChannelConnectionPollUseCase,
  EnqueueJobUseCase,
  ExecuteChannelPollConnectionUseCase,
  GuestCount,
  ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
  ICAL_PROVIDER_CAPABILITIES,
  IcalInventoryReconcileOutboxHandler,
  JobHandlerRegistry,
  LocalDate,
  OutboxHandlerRegistry,
  PermissionChecker,
  PollChannelConnectionJobHandler,
  POLL_CHANNEL_CONNECTION_JOB_TYPE,
  ProcessJobBatchUseCase,
  ProcessOutboxBatchUseCase,
  RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
  ReconcileIcalImportedInventoryJobHandler,
  ReconcileIcalImportedInventoryUseCase,
  ScheduleIcalPollsUseCase,
  StayPeriod,
  withDefaultProviderRegistrationPolicies,
  type IBackgroundJobHandler,
  type BackgroundJobEntry,
  type ReceiveChannelPollBatchUseCase,
} from "@hcp/domain";
import {
  PrismaBackgroundJobRepository,
  PrismaCalendarBlockRepository,
  PrismaChannelConnectionRepository,
  PrismaChannelInventoryReconciliationApplyStore,
  PrismaChannelListingMappingRepository,
  PrismaChannelPollCursorRepository,
  PrismaChannelPollInventoryCommitStore,
  PrismaChannelPollJobQuery,
  PrismaEligibleIcalPollConnectionReader,
  PrismaJobScheduler,
  PrismaOutboxRepository,
} from "../../src";
import { prisma, setTenantContext, truncateIntegrationTables } from "./helpers";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const TENANT = "550e8400-e29b-41d4-a716-446655440840";
const CONNECTION_ID = "s7b-chain-connection";
const MAPPING_ID = "s7b-chain-mapping";
const PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440841";
const UNIT_ID = "550e8400-e29b-41d4-a716-446655440842";

/** Mirrors apps/web PollingFeatureGatedPollJobHandler (CHANNELS_POLLING_ENABLED === "true"). */
class PollingFeatureGatedPollJobHandler implements IBackgroundJobHandler {
  constructor(
    private readonly inner: IBackgroundJobHandler,
    private readonly isEnabled: () => boolean = () =>
      process.env.CHANNELS_POLLING_ENABLED === "true",
  ) {}

  canHandle(jobType: string): boolean {
    return this.inner.canHandle(jobType);
  }

  async run(job: BackgroundJobEntry): Promise<void> {
    if (!this.isEnabled()) return;
    await this.inner.run(job);
  }
}

function nonemptyTrustedMappedSnapshot() {
  const item = {
    sourceIdentityKey: "uid-s7b-chain@example",
    entryContentHash: "b".repeat(64),
    identityKind: "uid_only" as const,
    checkIn: "2026-09-10",
    checkOut: "2026-09-13",
  };
  const compact = {
    i: item.sourceIdentityKey,
    h: item.entryContentHash,
    k: 1,
    s: item.checkIn,
    e: item.checkOut,
  };
  const canonicalJson = JSON.stringify([compact]);
  return {
    snapshotHash: "c".repeat(64),
    items: [item],
    canonicalJson,
    utf8ByteLength: Buffer.byteLength(canonicalJson, "utf8"),
    completeObservedEvidence: true as const,
    observedSourceIdentityKeys: [item.sourceIdentityKey],
    cancelledSourceIdentityKeys: [] as string[],
  };
}

async function seedGraph() {
  await prisma.tenant.upsert({
    where: { id: TENANT },
    create: {
      id: TENANT,
      name: "S7b Chain",
      slug: "int-s7b-chain",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });
  await prisma.property.upsert({
    where: { id: PROPERTY_ID },
    create: {
      id: PROPERTY_ID,
      tenantId: TENANT,
      name: "S7b Chain Property",
      slug: "s7b-chain-prop",
      status: "active",
      timezone: "UTC",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });
  await prisma.unit.upsert({
    where: { id: UNIT_ID },
    create: {
      id: UNIT_ID,
      tenantId: TENANT,
      propertyId: PROPERTY_ID,
      name: "S7b Chain Unit",
      slug: "s7b-chain-unit",
      status: "active",
      maxGuests: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: {},
  });

  await prisma.channelConnection.create({
    data: {
      tenantId: TENANT,
      id: CONNECTION_ID,
      provider: "ical",
      displayName: "S7b Chain",
      status: "active",
      credentialRef: "cred_s7b_chain",
      semanticMode: "availability_block_feed",
      semanticConfigVersion: 1,
      inventoryApplyEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const mappingRepo = new PrismaChannelListingMappingRepository();
  await mappingRepo.save(
    ChannelListingMapping.createActive({
      id: MAPPING_ID,
      tenantId: TENANT,
      connectionId: CONNECTION_ID,
      externalListingId: "ext-s7b-chain",
      propertyId: PROPERTY_ID,
      unitId: UNIT_ID,
      syncDirection: "inbound",
    }),
  );
}

runIntegration("P1-S7b operational chain (PostgreSQL schedule→jobs→TX1→outbox→TX2)", () => {
  const previousApply = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
  const previousPolling = process.env.CHANNELS_POLLING_ENABLED;
  const previousInterval = process.env.CHANNELS_ICAL_POLL_INTERVAL_MS;

  beforeEach(async () => {
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    process.env.CHANNELS_POLLING_ENABLED = "true";
    process.env.CHANNELS_ICAL_POLL_INTERVAL_MS = String(15 * 60 * 1000);
    await truncateIntegrationTables();
    await seedGraph();
  });

  afterAll(async () => {
    if (previousApply === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previousApply;
    if (previousPolling === undefined) delete process.env.CHANNELS_POLLING_ENABLED;
    else process.env.CHANNELS_POLLING_ENABLED = previousPolling;
    if (previousInterval === undefined) delete process.env.CHANNELS_ICAL_POLL_INTERVAL_MS;
    else process.env.CHANNELS_ICAL_POLL_INTERVAL_MS = previousInterval;
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it(
    "composes schedule → poll job → TX1 → outbox dispatch → reconcile job → TX2",
    async () => {
      const bookingsBefore = await prisma.booking.count({ where: { tenantId: TENANT } });
      const holdsBefore = await prisma.bookingHold.count({ where: { tenantId: TENANT } });

      const connectionRepository = new PrismaChannelConnectionRepository();
      const cursorRepository = new PrismaChannelPollCursorRepository();
      const commitStore = new PrismaChannelPollInventoryCommitStore();
      const applyStore = new PrismaChannelInventoryReconciliationApplyStore();
      const pollJobQuery = new PrismaChannelPollJobQuery();
      const eligibleReader = new PrismaEligibleIcalPollConnectionReader();
      const jobRepository = new PrismaBackgroundJobRepository();
      const jobScheduler = new PrismaJobScheduler(jobRepository);
      const enqueueJobUseCase = new EnqueueJobUseCase(jobScheduler);
      const outboxRepository = new PrismaOutboxRepository();

      const snapshot = nonemptyTrustedMappedSnapshot();
      const pollBatchUseCase = {
        execute: async () => ({
          ackAllowed: true as const,
          results: [] as [],
          proposedNextCursor: "s7b-chain-cursor-v1",
          inventoryActionableSnapshot: snapshot,
          inventoryProjectionFailureCode: null,
        }),
      } as unknown as ReceiveChannelPollBatchUseCase;

      const executePoll = new ExecuteChannelPollConnectionUseCase(
        connectionRepository,
        cursorRepository,
        pollBatchUseCase,
        commitStore,
      );

      const providerRegistry = new ChannelProviderRegistry();
      providerRegistry.register(
        withDefaultProviderRegistrationPolicies({
          providerId: "ical",
          status: "active",
          capabilities: ICAL_PROVIDER_CAPABILITIES,
          auth: null,
          webhooks: null,
          polling: {
            poll: async () => {
              throw new Error("scheduler must not call provider I/O");
            },
          } as never,
          reservationImport: null,
          availabilityExport: null,
          rateRestrictionExport: null,
          reservationExport: null,
        }),
      );

      const enqueuePoll = new EnqueueChannelConnectionPollUseCase(
        connectionRepository,
        providerRegistry,
        enqueueJobUseCase,
        new PermissionChecker(),
        pollJobQuery,
      );

      const schedule = new ScheduleIcalPollsUseCase(
        eligibleReader,
        pollJobQuery,
        enqueuePoll,
        enqueueJobUseCase,
        providerRegistry,
        () => process.env.CHANNELS_POLLING_ENABLED === "true",
      );

      const now = new Date();
      const scheduled = await schedule.execute({ now, random: () => 0 });
      expect(scheduled.isSuccess).toBe(true);
      expect(scheduled.getValue().enqueuedPolls).toBe(1);

      const pollJobs = await prisma.backgroundJob.findMany({
        where: {
          tenantId: TENANT,
          jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
        },
      });
      expect(pollJobs).toHaveLength(1);
      expect(pollJobs[0]!.status).toBe("pending");
      expect(pollJobs[0]!.idempotencyKey).toMatch(/:sched:/);

      const jobRegistry = new JobHandlerRegistry();
      jobRegistry.register(
        new PollingFeatureGatedPollJobHandler(new PollChannelConnectionJobHandler(executePoll)),
      );
      jobRegistry.register(
        new ReconcileIcalImportedInventoryJobHandler(
          new ReconcileIcalImportedInventoryUseCase(applyStore),
        ),
      );
      const processJobs = new ProcessJobBatchUseCase(jobRepository, jobRegistry);

      const pollBatch = await processJobs.execute(10, {
        jobTypes: [POLL_CHANNEL_CONNECTION_JOB_TYPE],
      });
      expect(pollBatch.isSuccess).toBe(true);
      expect(pollBatch.getValue()).toMatchObject({
        claimed: 1,
        completed: 1,
        deadLettered: 0,
      });

      const pollAfter = await prisma.backgroundJob.findUnique({
        where: { id: pollJobs[0]!.id },
      });
      expect(pollAfter?.status).toBe("completed");

      await setTenantContext(prisma, TENANT);
      const cursor = await prisma.channelPollCursor.findUnique({
        where: {
          tenantId_connectionId: { tenantId: TENANT, connectionId: CONNECTION_ID },
        },
      });
      expect(cursor?.version).toBe(1);
      expect(cursor?.payload).toBe("s7b-chain-cursor-v1");

      const generations = await prisma.channelInventoryReconciliation.findMany({
        where: { tenantId: TENANT, connectionId: CONNECTION_ID },
      });
      expect(generations).toHaveLength(1);
      expect(generations[0]?.reconcileStatus).toBe("pending");
      expect(generations[0]?.cursorVersion).toBe(1);

      const outboxPending = await prisma.outboxEvent.findMany({
        where: {
          tenantId: TENANT,
          eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
        },
      });
      expect(outboxPending).toHaveLength(1);
      expect(outboxPending[0]?.status).toBe("pending");

      const outboxRegistry = new OutboxHandlerRegistry();
      outboxRegistry.register(new IcalInventoryReconcileOutboxHandler(enqueueJobUseCase));
      const processOutbox = new ProcessOutboxBatchUseCase(outboxRepository, outboxRegistry);

      const dispatch = await processOutbox.execute(10);
      expect(dispatch.isSuccess).toBe(true);

      const outboxAfter = await prisma.outboxEvent.findUnique({
        where: { id: outboxPending[0]!.id },
      });
      expect(outboxAfter?.status).toBe("completed");

      const reconcileJobs = await prisma.backgroundJob.findMany({
        where: {
          tenantId: TENANT,
          jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
        },
      });
      expect(reconcileJobs).toHaveLength(1);
      expect(reconcileJobs[0]!.status).toBe("pending");

      // Dedupe: second dispatch must not create another reconcile job
      const dispatchAgain = await processOutbox.execute(10);
      expect(dispatchAgain.isSuccess).toBe(true);
      expect(
        await prisma.backgroundJob.count({
          where: {
            tenantId: TENANT,
            jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
          },
        }),
      ).toBe(1);

      const reconcileBatch = await processJobs.execute(10, {
        jobTypes: [RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE],
      });
      expect(reconcileBatch.isSuccess).toBe(true);
      expect(reconcileBatch.getValue()).toMatchObject({
        claimed: 1,
        completed: 1,
        deadLettered: 0,
      });

      const reconcileAfter = await prisma.backgroundJob.findUnique({
        where: { id: reconcileJobs[0]!.id },
      });
      expect(reconcileAfter?.status).toBe("completed");

      const applied = await prisma.channelInventoryReconciliation.findUnique({
        where: {
          tenantId_connectionId_cursorVersion: {
            tenantId: TENANT,
            connectionId: CONNECTION_ID,
            cursorVersion: 1,
          },
        },
      });
      expect(applied?.reconcileStatus).toBe("applied");
      expect(applied?.appliedAt).not.toBeNull();

      const imports = await prisma.unitCalendarBlock.findMany({
        where: {
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          blockType: "channel_import",
        },
      });
      expect(imports).toHaveLength(1);
      expect(imports[0]?.status).toBe("active");
      expect(imports[0]?.sourceIdentityKey).toBe("uid-s7b-chain@example");

      const activeDuplicates = await prisma.unitCalendarBlock.count({
        where: {
          tenantId: TENANT,
          connectionId: CONNECTION_ID,
          blockType: "channel_import",
          status: "active",
          sourceIdentityKey: "uid-s7b-chain@example",
        },
      });
      expect(activeDuplicates).toBe(1);

      const calendar = new PrismaCalendarBlockRepository();
      const activeBlocks = await calendar.findActiveBlocks(UNIT_ID, TENANT);
      const availability = new AvailabilityEvaluator().evaluate({
        stayPeriod: StayPeriod.create("2026-09-10", "2026-09-12"),
        guestCount: GuestCount.create(2),
        unitMaxGuests: 4,
        rules: {
          minNights: 1,
          maxNights: 30,
          checkInDays: [0, 1, 2, 3, 4, 5, 6],
          checkOutDays: [0, 1, 2, 3, 4, 5, 6],
          advanceMinDays: 0,
          advanceMaxDays: 365,
          turnoverNights: 0,
        },
        activeBlocks,
        propertyLocalToday: LocalDate.create("2026-09-01"),
      });
      expect(availability.available).toBe(false);

      expect(await prisma.booking.count({ where: { tenantId: TENANT } })).toBe(bookingsBefore);
      expect(await prisma.bookingHold.count({ where: { tenantId: TENANT } })).toBe(holdsBefore);
      expect(
        await prisma.unitCalendarBlock.count({
          where: { tenantId: TENANT, blockType: "hold" },
        }),
      ).toBe(0);
      expect(
        await prisma.unitCalendarBlock.count({
          where: { tenantId: TENANT, blockType: "booking" },
        }),
      ).toBe(0);
      expect(
        await prisma.externalReservationLink.count({ where: { tenantId: TENANT } }),
      ).toBe(0);
    },
    180_000,
  );

  it(
    "global ON + connection apply OFF → poll advances cursor, no generation",
    async () => {
      await prisma.channelConnection.update({
        where: { tenantId_id: { tenantId: TENANT, id: CONNECTION_ID } },
        data: { inventoryApplyEnabled: false },
      });

      const connectionRepository = new PrismaChannelConnectionRepository();
      const cursorRepository = new PrismaChannelPollCursorRepository();
      const commitStore = new PrismaChannelPollInventoryCommitStore();
      const pollJobQuery = new PrismaChannelPollJobQuery();
      const eligibleReader = new PrismaEligibleIcalPollConnectionReader();
      const jobRepository = new PrismaBackgroundJobRepository();
      const jobScheduler = new PrismaJobScheduler(jobRepository);
      const enqueueJobUseCase = new EnqueueJobUseCase(jobScheduler);

      const snapshot = nonemptyTrustedMappedSnapshot();
      const pollBatchUseCase = {
        execute: async () => ({
          ackAllowed: true as const,
          results: [] as [],
          proposedNextCursor: "s7b-chain-cursor-off",
          inventoryActionableSnapshot: snapshot,
          inventoryProjectionFailureCode: null,
        }),
      } as unknown as ReceiveChannelPollBatchUseCase;

      const executePoll = new ExecuteChannelPollConnectionUseCase(
        connectionRepository,
        cursorRepository,
        pollBatchUseCase,
        commitStore,
      );

      const providerRegistry = new ChannelProviderRegistry();
      providerRegistry.register(
        withDefaultProviderRegistrationPolicies({
          providerId: "ical",
          status: "active",
          capabilities: ICAL_PROVIDER_CAPABILITIES,
          auth: null,
          webhooks: null,
          polling: {
            poll: async () => {
              throw new Error("scheduler must not call provider I/O");
            },
          } as never,
          reservationImport: null,
          availabilityExport: null,
          rateRestrictionExport: null,
          reservationExport: null,
        }),
      );

      const enqueuePoll = new EnqueueChannelConnectionPollUseCase(
        connectionRepository,
        providerRegistry,
        enqueueJobUseCase,
        new PermissionChecker(),
        pollJobQuery,
      );

      const schedule = new ScheduleIcalPollsUseCase(
        eligibleReader,
        pollJobQuery,
        enqueuePoll,
        enqueueJobUseCase,
        providerRegistry,
        () => process.env.CHANNELS_POLLING_ENABLED === "true",
      );

      const scheduled = await schedule.execute({ now: new Date(), random: () => 0 });
      expect(scheduled.isSuccess).toBe(true);
      expect(scheduled.getValue().enqueuedPolls).toBe(1);

      const jobRegistry = new JobHandlerRegistry();
      jobRegistry.register(
        new PollingFeatureGatedPollJobHandler(new PollChannelConnectionJobHandler(executePoll)),
      );
      const processJobs = new ProcessJobBatchUseCase(jobRepository, jobRegistry);
      const pollBatch = await processJobs.execute(10, {
        jobTypes: [POLL_CHANNEL_CONNECTION_JOB_TYPE],
      });
      expect(pollBatch.isSuccess).toBe(true);
      expect(pollBatch.getValue()).toMatchObject({ claimed: 1, completed: 1 });

      await setTenantContext(prisma, TENANT);
      const cursor = await prisma.channelPollCursor.findUnique({
        where: {
          tenantId_connectionId: { tenantId: TENANT, connectionId: CONNECTION_ID },
        },
      });
      expect(cursor?.version).toBe(1);
      expect(cursor?.payload).toBe("s7b-chain-cursor-off");
      expect(
        await prisma.channelInventoryReconciliation.count({
          where: { tenantId: TENANT, connectionId: CONNECTION_ID },
        }),
      ).toBe(0);
      expect(
        await prisma.outboxEvent.count({
          where: {
            tenantId: TENANT,
            eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
          },
        }),
      ).toBe(0);
    },
    120_000,
  );
});

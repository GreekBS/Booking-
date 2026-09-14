import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { ChannelConnection, ChannelListingMapping, CredentialReference } from "@hcp/domain";
import {
  buildSimulatedProviderMessage,
  DEFAULT_SIMULATED_FIXTURE,
} from "../../../domain/src/channels/simulation/SimulatedReservationFixtures";
import { FAKE_CHANNEL_PROVIDER_ID } from "../../../domain/src/channels/simulation/FakeChannelReservationImportProvider";
import { ChannelInboxItem } from "@hcp/domain";
import { ChannelInboxDeduplicationKey } from "@hcp/domain";
import { truncateIntegrationTables, prisma } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { buildChannelInboxIntegrationStack } from "./channelInboxIntegrationStack";

const runIntegration = process.env.DATABASE_URL
  ? (title: string, fn: () => void) =>
      describe(title, { hookTimeout: 120_000, timeout: 120_000 }, fn)
  : (title: string, fn: () => void) => describe.skip(title, fn);

runIntegration("CM-3c channel inbox pipeline integration", () => {
  const stack = buildChannelInboxIntegrationStack();

  const tenantId = "550e8400-e29b-41d4-a716-446655442200";
  const propertyId = "550e8400-e29b-41d4-a716-446655442201";
  const unitId = "550e8400-e29b-41d4-a716-446655442202";
  const connectionId = "550e8400-e29b-41d4-a716-446655442203";
  const mappingId = "550e8400-e29b-41d4-a716-446655442204";

  function buildMessage(externalReservationId: string) {
    return buildSimulatedProviderMessage({
      messageId: `msg-${externalReservationId}`,
      connectionId,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      externalListingId: "inbox-listing-001",
      externalUnitId: "room-a",
      externalReservationId,
      payload: {
        ...DEFAULT_SIMULATED_FIXTURE,
        checkIn: "2027-06-01",
        checkOut: "2027-06-05",
      },
    });
  }

  async function seedChannel() {
    const connection = ChannelConnection.createDraft({
      id: connectionId,
      tenantId,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      displayName: "Inbox Integration Connection",
    });
    connection.attachCredentials(CredentialReference.create("cred_inbox_001"));
    connection.activate();
    await stack.connectionRepository.create(connection);

    const mapping = ChannelListingMapping.createActive({
      id: mappingId,
      tenantId,
      connectionId,
      externalListingId: "inbox-listing-001",
      externalUnitId: "room-a",
      propertyId,
      unitId,
      syncDirection: "bidirectional",
    });
    await stack.mappingRepository.save(mapping);
  }

  async function receiveAndProcess(externalReservationId: string) {
    const received = await stack.receiveUseCase.execute({
      tenantId,
      connectionId,
      ingressKind: "webhook",
      message: buildMessage(externalReservationId),
    });
    expect(received.isSuccess).toBe(true);
    const { inboxItemId } = received.getValue();

    const run = await stack.processJobBatchUseCase.execute(10, {
      jobTypes: [stack.PROCESS_CHANNEL_INBOX_JOB_TYPE],
    });
    expect(run.isSuccess).toBe(true);

    const inbox = await stack.inboxRepository.findById(tenantId, inboxItemId);
    return { inboxItemId, inbox };
  }

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
    await seedChannel();
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("receive creates inbox item and durable job", async () => {
    const result = await stack.receiveUseCase.execute({
      tenantId,
      connectionId,
      ingressKind: "webhook",
      message: buildMessage("receive-001"),
    });

    expect(result.isSuccess).toBe(true);
    const { inboxItemId, jobId } = result.getValue();

    const inbox = await prisma.channelInboxItem.findUnique({
      where: { tenantId_id: { tenantId, id: inboxItemId } },
    });
    expect(inbox?.status).toBe("received");

    const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
    expect(job?.jobType).toBe(stack.PROCESS_CHANNEL_INBOX_JOB_TYPE);
    expect(job?.idempotencyKey).toBe(inboxItemId);
  });

  it("duplicate delivery does not create a second booking", async () => {
    const first = await receiveAndProcess("dup-001");
    expect(first.inbox?.outcome).toBe("SUCCESS");

    const duplicateReceive = await stack.receiveUseCase.execute({
      tenantId,
      connectionId,
      ingressKind: "webhook",
      message: buildMessage("dup-001"),
    });
    expect(duplicateReceive.isSuccess).toBe(true);
    expect(duplicateReceive.getValue().deduplicated).toBe(true);

    const rerun = await stack.processJobBatchUseCase.execute(10, {
      jobTypes: [stack.PROCESS_CHANNEL_INBOX_JOB_TYPE],
    });
    expect(rerun.isSuccess).toBe(true);

    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.externalReservationLink.count({ where: { tenantId } })).toBe(1);
  });

  it("processes import to confirmed booking and link", async () => {
    const { inbox } = await receiveAndProcess("success-001");
    expect(inbox?.status).toBe("completed");
    expect(inbox?.outcome).toBe("SUCCESS");
    expect(inbox?.resultBookingId).toBeTruthy();
    expect(inbox?.resultLinkId).toBeTruthy();
  });

  it("replay creates a new inbox item and duplicate outcome when booking exists", async () => {
    const first = await receiveAndProcess("replay-001");
    expect(first.inbox?.outcome).toBe("SUCCESS");

    await prisma.channelInboxItem.update({
      where: { tenantId_id: { tenantId, id: first.inboxItemId } },
      data: { status: "dead_letter", outcome: "AVAILABILITY_CONFLICT" },
    });

    const replay = await stack.replayUseCase.execute({
      tenantId,
      sourceInboxItemId: first.inboxItemId,
    });
    expect(replay.isSuccess).toBe(true);

    const replayInboxId = replay.getValue().inboxItemId;
    expect(replayInboxId).not.toBe(first.inboxItemId);

    await stack.processJobBatchUseCase.execute(10, {
      jobTypes: [stack.PROCESS_CHANNEL_INBOX_JOB_TYPE],
    });

    const replayInbox = await stack.inboxRepository.findById(tenantId, replayInboxId);
    expect(replayInbox?.ingressKind).toBe("replay");
    expect(replayInbox?.outcome).toBe("DUPLICATE");
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
  });

  it("concurrent imports for same external reservation create one booking", async () => {
    const extId = "concurrent-same-ext";
    const dedupKey = ChannelInboxDeduplicationKey.forCreate(connectionId, extId).value;

    const itemA = ChannelInboxItem.createNew({
      id: "inbox-concurrent-a",
      tenantId,
      connectionId,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      ingressKind: "webhook",
      message: buildMessage(extId),
      deduplicationKey: ChannelInboxDeduplicationKey.reconstitute(`${dedupKey}:race-a`),
    });
    const itemB = ChannelInboxItem.createNew({
      id: "inbox-concurrent-b",
      tenantId,
      connectionId,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      ingressKind: "webhook",
      message: buildMessage(extId),
      deduplicationKey: ChannelInboxDeduplicationKey.reconstitute(`${dedupKey}:race-b`),
    });

    await stack.inboxRepository.insert(itemA);
    await stack.inboxRepository.insert(itemB);

    await stack.backgroundJobRepository.enqueue({
      tenantId,
      jobType: stack.PROCESS_CHANNEL_INBOX_JOB_TYPE,
      payload: { inboxItemId: itemA.id },
      idempotencyKey: itemA.id,
    });
    await stack.backgroundJobRepository.enqueue({
      tenantId,
      jobType: stack.PROCESS_CHANNEL_INBOX_JOB_TYPE,
      payload: { inboxItemId: itemB.id },
      idempotencyKey: itemB.id,
    });

    await stack.processInboxUseCase.execute({
      tenantId,
      inboxItemId: itemA.id,
      workerId: "worker-a",
    });
    await stack.processInboxUseCase.execute({
      tenantId,
      inboxItemId: itemB.id,
      workerId: "worker-b",
    });

    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
    expect(
      await prisma.externalReservationLink.count({
        where: { tenantId, connectionId, externalReservationId: extId },
      }),
    ).toBe(1);
  });

  it("overlapping reservations on same unit produce availability conflict and rollback", async () => {
    const first = await receiveAndProcess("overlap-a");
    expect(first.inbox?.outcome).toBe("SUCCESS");

    const second = await receiveAndProcess("overlap-b");
    expect(second.inbox?.outcome).toBe("AVAILABILITY_CONFLICT");
    expect(second.inbox?.status).toBe("dead_letter");
    expect(second.inbox?.resultBookingId).toBeNull();

    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.externalReservationLink.count({ where: { tenantId } })).toBe(1);
    const blocks = await stack.calendarRepository.findActiveBlocks(unitId, tenantId);
    expect(blocks.filter((block) => block.blockType === "booking")).toHaveLength(1);
  });
});

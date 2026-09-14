import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { ChannelInboxItem } from "@hcp/domain";
import { ChannelInboxDeduplicationKey } from "@hcp/domain";
import { truncateIntegrationTables, prisma } from "./helpers";
import { PrismaChannelInboxRepository } from "../../src/repositories/channels/ChannelInboxRepository";
import {
  buildSimulatedProviderMessage,
  DEFAULT_SIMULATED_FIXTURE,
} from "../../../domain/src/channels/simulation/SimulatedReservationFixtures";
import { FAKE_CHANNEL_PROVIDER_ID } from "../../../domain/src/channels/simulation/FakeChannelReservationImportProvider";

const runIntegration = process.env.DATABASE_URL
  ? (title: string, fn: () => void) =>
      describe(title, { hookTimeout: 120_000, timeout: 120_000 }, fn)
  : (title: string, fn: () => void) => describe.skip(title, fn);

runIntegration("ChannelInboxRepository integration", () => {
  const repository = new PrismaChannelInboxRepository();
  const tenantId = "550e8400-e29b-41d4-a716-446655442300";
  const connectionId = "conn-lease-test";

  function buildItem(id: string, dedupSuffix: string) {
    return ChannelInboxItem.createNew({
      id,
      tenantId,
      connectionId,
      provider: FAKE_CHANNEL_PROVIDER_ID,
      ingressKind: "webhook",
      message: buildSimulatedProviderMessage({
        messageId: `msg-${id}`,
        connectionId,
        provider: FAKE_CHANNEL_PROVIDER_ID,
        externalListingId: "listing",
        externalReservationId: `res-${dedupSuffix}`,
        payload: DEFAULT_SIMULATED_FIXTURE,
      }),
      deduplicationKey: ChannelInboxDeduplicationKey.forCreate(connectionId, `res-${dedupSuffix}`),
    });
  }

  beforeEach(async () => {
    await truncateIntegrationTables();
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("deduplicates inserts by tenant and deduplication key", async () => {
    const item = buildItem("inbox-1", "dedup");
    const first = await repository.insert(item);
    const second = await repository.insert(item);

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.item.id).toBe(first.item.id);
  });

  it("allows only one active claim at a time", async () => {
    const item = buildItem("inbox-claim", "claim");
    await repository.insert(item);

    const tokenA = "token-a";
    const claimedA = await repository.claim({
      tenantId,
      inboxItemId: item.id,
      workerId: "worker-a",
      processingToken: tokenA,
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    const claimedB = await repository.claim({
      tenantId,
      inboxItemId: item.id,
      workerId: "worker-b",
      processingToken: "token-b",
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });

    expect(claimedA?.processingToken).toBe(tokenA);
    expect(claimedB).toBeNull();
  });

  it("reclaims expired leases", async () => {
    const item = buildItem("inbox-reclaim", "reclaim");
    await repository.insert(item);

    await repository.claim({
      tenantId,
      inboxItemId: item.id,
      workerId: "worker-a",
      processingToken: "token-a",
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });

    await prisma.channelInboxItem.update({
      where: { tenantId_id: { tenantId, id: item.id } },
      data: { leaseExpiresAt: new Date(0) },
    });

    const reclaimed = await repository.claim({
      tenantId,
      inboxItemId: item.id,
      workerId: "worker-b",
      processingToken: "token-b",
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });

    expect(reclaimed?.leaseOwner).toBe("worker-b");
    expect(reclaimed?.processingToken).toBe("token-b");
  });

  it("rejects completion with stale processing token", async () => {
    const item = buildItem("inbox-token", "token");
    await repository.insert(item);

    await repository.claim({
      tenantId,
      inboxItemId: item.id,
      workerId: "worker-a",
      processingToken: "valid-token",
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });

    const stale = await repository.complete({
      tenantId,
      inboxItemId: item.id,
      processingToken: "wrong-token",
      status: "completed",
      outcome: "SUCCESS",
      processedAt: new Date(),
    });
    expect(stale).toBe(false);

    const valid = await repository.complete({
      tenantId,
      inboxItemId: item.id,
      processingToken: "valid-token",
      status: "completed",
      outcome: "SUCCESS",
      processedAt: new Date(),
    });
    expect(valid).toBe(true);
  });
});

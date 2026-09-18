import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { FAKE_CHANNEL_PROVIDER_ID } from "../../../domain/src/channels/simulation/FakeChannelReservationImportProvider";
import { truncateIntegrationTables, prisma } from "./helpers";
import { buildChannelInboxIntegrationStack } from "./channelInboxIntegrationStack";
import { integrationDatabaseConfigured } from "./integrationGate";

const runIntegration = integrationDatabaseConfigured
  ? (title: string, fn: () => void) =>
      describe(title, { hookTimeout: 120_000, timeout: 120_000 }, fn)
  : (title: string, fn: () => void) => describe.skip(title, fn);

runIntegration("CM-4a-5 provider contract postgres wrapper", () => {
  const stack = buildChannelInboxIntegrationStack();
  const tenantId = "550e8400-e29b-41d4-a716-446655442210";
  const connectionId = "550e8400-e29b-41d4-a716-446655442211";

  beforeEach(async () => {
    await truncateIntegrationTables();
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("persists reservation.unknown evidence through ReceiveChannelEventUseCase", async () => {
    const result = await stack.receiveUseCase.execute({
      tenantId,
      connectionId,
      ingressKind: "webhook",
      message: {
        messageId: "pg-unknown-1",
        kind: "reservation.unknown",
        connectionId,
        provider: FAKE_CHANNEL_PROVIDER_ID,
        externalReservationId: "ext-pg-unknown-1",
        receivedAt: new Date("2027-01-01T00:00:00.000Z"),
        payload: {
          providerEventType: "reservation.reinstated",
          providerEventId: "evt-pg-reinstated-1",
          evidence: { source: "contract-harness" },
        },
      },
    });

    expect(result.isSuccess).toBe(true);
    const { inboxItemId } = result.getValue();
    const inbox = await stack.inboxRepository.findById(tenantId, inboxItemId);
    expect(inbox?.messageKind).toBe("reservation.unknown");
    expect(inbox?.rawPayload.payload).toMatchObject({
      providerEventType: "reservation.reinstated",
      providerEventId: "evt-pg-reinstated-1",
    });
  });
});

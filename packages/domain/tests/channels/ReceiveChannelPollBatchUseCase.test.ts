import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChannelProviderRegistry } from "../../src/channels/providers/ChannelProviderRegistry";
import {
  createTestChannelTransportProviderRegistration,
  TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
} from "../../src/channels/simulation/TestChannelTransportProviderBundle";
import { TestChannelPollingProvider } from "../../src/channels/simulation/TestChannelPollingProvider";
import { ReceiveChannelPollBatchUseCase } from "../../src/channels/application/ReceiveChannelPollBatchUseCase";
import { InMemoryChannelPollCursorRepository } from "../../src/channels/repositories/InMemoryChannelPollCursorRepository";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { createChannelIngressTestStack } from "./helpers/channelIngressTestStack";
import { buildTransportTestMessage } from "./fixtures/testChannelTransportFixtures";

describe("ReceiveChannelPollBatchUseCase", () => {
  let stack: Awaited<ReturnType<typeof createChannelIngressTestStack>>;
  const cursorRepository = new InMemoryChannelPollCursorRepository(
    new InMemoryChannelConnectionRepository(),
  );

  beforeEach(async () => {
    stack = await createChannelIngressTestStack();
    cursorRepository.clear();
  });

  it("returns ackAllowed true and proposedNextCursor without persisting cursor", async () => {
    stack.pollingProvider.seedCursorMessages(null, [
      buildTransportTestMessage({
        messageId: "poll-create-1",
        kind: "reservation.create",
        connectionId: stack.connectionId,
        externalReservationId: "ext-poll-1",
        payload: {},
      }),
    ]);

    const result = await stack.pollBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      cursorPayload: null,
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.proposedNextCursor).toBe("cursor-1");
    expect(await cursorRepository.getCursor(stack.tenantId, stack.connectionId)).toBeNull();
  });

  it("rejects provenance mismatch before Receive", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");
    stack.pollingProvider.seedCursorMessages(null, [
      buildTransportTestMessage({
        messageId: "poll-bad",
        kind: "reservation.create",
        connectionId: "other-connection",
        externalReservationId: "ext-poll-bad",
        payload: {},
      }),
    ]);

    const result = await stack.pollBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      cursorPayload: null,
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failurePhase).toBe("provenance");
    expect(result.proposedNextCursor).toBeNull();
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("allows poll when credential policy does not require credentialRef", async () => {
    const registry = new ChannelProviderRegistry();
    const pollingProvider = new TestChannelPollingProvider();
    pollingProvider.seedCursorMessages(null, []);

    registry.register(
      createTestChannelTransportProviderRegistration({
        pollingProvider,
        pollAuthPolicy: { requiresCredentialRef: false },
      }),
    );

    const connectionRepository = new InMemoryChannelConnectionRepository();
    const existing = await stack.connectionRepository.findById(stack.tenantId, stack.connectionId);
    await connectionRepository.create(existing!);

    const useCase = new ReceiveChannelPollBatchUseCase(
      connectionRepository,
      stack.credentialResolver,
      registry,
      stack.batchProcessor,
    );

    const result = await useCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      cursorPayload: null,
    });

    expect(result.ackAllowed).toBe(true);
  });
});

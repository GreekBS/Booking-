import { describe, it, expect, beforeEach, vi } from "vitest";
import { Result } from "../../src/shared/kernel/Result";
import {
  buildTestWebhookSignature,
  TEST_WEBHOOK_SIGNATURE_HEADER,
} from "../../src/channels/simulation/TestChannelWebhookProvider";
import {
  createTestChannelTransportProviderRegistration,
  TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
} from "../../src/channels/simulation/TestChannelTransportProviderBundle";
import { ReceiveChannelWebhookBatchUseCase } from "../../src/channels/application/ReceiveChannelWebhookBatchUseCase";
import { ChannelProviderRegistry } from "../../src/channels/providers/ChannelProviderRegistry";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { DEFAULT_SIMULATED_FIXTURE } from "../../src/channels/simulation/SimulatedReservationFixtures";
import { createChannelIngressTestStack } from "./helpers/channelIngressTestStack";
import { buildTransportTestMessage } from "./fixtures/testChannelTransportFixtures";
import { encodeChannelWebhookBody } from "../../src/channels/types/ChannelWebhookTransportRequest";

describe("ReceiveChannelWebhookBatchUseCase", () => {
  let stack: Awaited<ReturnType<typeof createChannelIngressTestStack>>;

  beforeEach(async () => {
    stack = await createChannelIngressTestStack();
  });

  function buildSignedRequest(messages: ReturnType<typeof buildTransportTestMessage>[]) {
    const rawBody = JSON.stringify(messages);
    const rawBodyBytes = encodeChannelWebhookBody(rawBody);
    return {
      headers: {
        [TEST_WEBHOOK_SIGNATURE_HEADER]: buildTestWebhookSignature("test-webhook-secret", rawBody),
      },
      rawBody,
      rawBodyBytes,
    };
  }

  it("returns ackAllowed true when all Receive calls succeed", async () => {
    const messages = [
      buildTransportTestMessage({
        messageId: "msg-create",
        kind: "reservation.create",
        connectionId: stack.connectionId,
        externalReservationId: "ext-create-1",
        payload: DEFAULT_SIMULATED_FIXTURE,
      }),
    ];

    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: buildSignedRequest(messages),
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.results).toHaveLength(1);
  });

  it("durably receives reservation.modify instead of skipping it", async () => {
    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: buildSignedRequest([
        buildTransportTestMessage({
          messageId: "msg-modify",
          kind: "reservation.modify",
          connectionId: stack.connectionId,
          externalReservationId: "ext-modify-1",
          payload: { externalRevision: "rev-1" },
        }),
      ]),
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.results[0]?.success).toBe(true);
  });

  it("durably receives reservation.cancel instead of skipping it", async () => {
    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: buildSignedRequest([
        buildTransportTestMessage({
          messageId: "msg-cancel",
          kind: "reservation.cancel",
          connectionId: stack.connectionId,
          externalReservationId: "ext-cancel-1",
          payload: { externalRevision: "rev-cancel-1" },
        }),
      ]),
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.results[0]?.success).toBe(true);
  });

  it("rejects undeclared normalized ingress kinds before Receive", async () => {
    stack.webhookProvider.setParseHandler(async () => [
      buildTransportTestMessage({
        messageId: "msg-invalid-kind",
        kind: "reservation.reinstated" as "reservation.create",
        connectionId: stack.connectionId,
        externalReservationId: "ext-reinstated",
        payload: { providerEventType: "reservation.reinstated" },
      }),
    ]);

    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");
    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: buildSignedRequest([]),
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failurePhase).toBe("malformed");
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("durably receives reservation.unknown without externalReservationId", async () => {
    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: buildSignedRequest([
        buildTransportTestMessage({
          messageId: "msg-unknown",
          kind: "reservation.unknown",
          connectionId: stack.connectionId,
          payload: { providerEventId: "provider-event-1" },
        }),
      ]),
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.results[0]?.success).toBe(true);
  });

  it("returns ackAllowed false when one Receive fails", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");
    receiveSpy
      .mockResolvedValueOnce(
        Result.ok({ inboxItemId: "inbox-1", deduplicated: false, jobId: "job-1" }),
      )
      .mockResolvedValueOnce(Result.fail(new Error("receive failed")));

    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: buildSignedRequest([
        buildTransportTestMessage({
          messageId: "msg-1",
          kind: "reservation.create",
          connectionId: stack.connectionId,
          externalReservationId: "ext-1",
        }),
        buildTransportTestMessage({
          messageId: "msg-2",
          kind: "reservation.create",
          connectionId: stack.connectionId,
          externalReservationId: "ext-2",
        }),
      ]),
    });

    expect(result.ackAllowed).toBe(false);
    expect(receiveSpy).toHaveBeenCalledTimes(2);
  });

  it("does not call Receive for inactive connections", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");
    const paused = await stack.connectionRepository.findById(stack.tenantId, stack.connectionId);
    const priorStatus = paused!.status;
    const version = paused!.semanticConfigVersion;
    paused!.pause();
    await stack.connectionRepository.pauseWithExpectedSemanticVersion(
      paused!,
      version,
      priorStatus,
    );

    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: buildSignedRequest([
        buildTransportTestMessage({
          messageId: "msg-1",
          kind: "reservation.create",
          connectionId: stack.connectionId,
          externalReservationId: "ext-1",
        }),
      ]),
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failurePhase).toBe("connection");
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("rejects command provider mismatch before Receive", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: "booking_com",
      request: buildSignedRequest([]),
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failurePhase).toBe("connection");
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("rejects parsed provider mismatch for the complete batch", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: buildSignedRequest([
        buildTransportTestMessage({
          messageId: "msg-1",
          kind: "reservation.create",
          connectionId: stack.connectionId,
          provider: "booking_com",
          externalReservationId: "ext-1",
        }),
      ]),
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failurePhase).toBe("provenance");
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("rejects parsed connection mismatch for the complete batch", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: buildSignedRequest([
        buildTransportTestMessage({
          messageId: "msg-1",
          kind: "reservation.create",
          connectionId: "other-connection",
          externalReservationId: "ext-1",
        }),
      ]),
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failurePhase).toBe("provenance");
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("rejects verification failure before Receive", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: {
        headers: { [TEST_WEBHOOK_SIGNATURE_HEADER]: "invalid" },
        rawBody: "[]",
        rawBodyBytes: encodeChannelWebhookBody("[]"),
      },
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failurePhase).toBe("verify");
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed unknown events before ACK", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: buildSignedRequest([
        buildTransportTestMessage({
          messageId: "",
          kind: "reservation.unknown",
          connectionId: stack.connectionId,
          payload: {},
        }),
      ]),
    });

    expect(result.ackAllowed).toBe(false);
    expect(result.failurePhase).toBe("malformed");
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("allows empty reservation batches when verify and parse succeed", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await stack.webhookBatchUseCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: buildSignedRequest([]),
    });

    expect(result.ackAllowed).toBe(true);
    expect(result.results).toHaveLength(0);
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("does not require webhookVerificationRef when provider policy disables it", async () => {
    const registry = new ChannelProviderRegistry();
    registry.register(
      createTestChannelTransportProviderRegistration({
        webhookAuthPolicy: {
          requiresVerification: true,
          requiresWebhookVerificationRef: false,
          requiresCredentialRef: false,
        },
      }),
    );

    const connectionRepository = new InMemoryChannelConnectionRepository();
    const connection = ChannelConnection.createDraft({
      id: stack.connectionId,
      tenantId: stack.tenantId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      displayName: "No webhook ref",
    });
    connection.attachCredentials(CredentialReference.create("cred_only"));
    connection.activate();
    await connectionRepository.create(connection);

    const useCase = new ReceiveChannelWebhookBatchUseCase(
      connectionRepository,
      stack.credentialResolver,
      registry,
      stack.batchProcessor,
    );

    const result = await useCase.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      request: { headers: {}, rawBody: "[]", rawBodyBytes: encodeChannelWebhookBody("[]") },
    });

    expect(result.ackAllowed).toBe(true);
  });
});

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
import { HandleChannelWebhookTransportUseCase } from "../../src/channels/application/HandleChannelWebhookTransportUseCase";
import { ReceiveChannelWebhookBatchUseCase } from "../../src/channels/application/ReceiveChannelWebhookBatchUseCase";
import { ChannelProviderRegistry } from "../../src/channels/providers/ChannelProviderRegistry";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { WebhookVerificationReference } from "../../src/channels/domain/value-objects/WebhookVerificationReference";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { DEFAULT_SIMULATED_FIXTURE } from "../../src/channels/simulation/SimulatedReservationFixtures";
import {
  createChannelWebhookTransportRequest,
  encodeChannelWebhookBody,
} from "../../src/channels/types/ChannelWebhookTransportRequest";
import type { IChannelCredentialResolver } from "../../src/channels/ports/IChannelCredentialResolver";
import type { CredentialReference as CredentialRef } from "../../src/channels/domain/value-objects/CredentialReference";
import type { WebhookVerificationReference as WebhookRef } from "../../src/channels/domain/value-objects/WebhookVerificationReference";
import { createChannelIngressTestStack } from "./helpers/channelIngressTestStack";
import { buildTransportTestMessage } from "./fixtures/testChannelTransportFixtures";
import { decodeUtf8Bytes } from "../../src/shared/kernel/Utf8Bytes";

describe("HandleChannelWebhookTransportUseCase", () => {
  let stack: Awaited<ReturnType<typeof createChannelIngressTestStack>>;

  beforeEach(async () => {
    stack = await createChannelIngressTestStack();
  });

  function buildSignedTransportRequest(
    messages: ReturnType<typeof buildTransportTestMessage>[],
    rawBodyOverride?: string,
  ) {
    const rawBody = rawBodyOverride ?? JSON.stringify(messages);
    const rawBodyBytes = encodeChannelWebhookBody(rawBody);
    return createChannelWebhookTransportRequest({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      headers: {
        [TEST_WEBHOOK_SIGNATURE_HEADER]: buildTestWebhookSignature(
          "test-webhook-secret",
          rawBody,
        ),
      },
      rawBodyBytes,
    });
  }

  it("1. allows ACK for a valid single reservation event with durable Receive", async () => {
    const result = await stack.webhookTransportUseCase.execute(
      buildSignedTransportRequest([
        buildTransportTestMessage({
          messageId: "msg-create-1",
          kind: "reservation.create",
          connectionId: stack.connectionId,
          externalReservationId: "ext-create-1",
          payload: DEFAULT_SIMULATED_FIXTURE,
        }),
      ]),
    );

    expect(result.ackAllowed).toBe(true);
    expect(result.ackClassification).toBe("ack_allowed");
    expect(result.persistedMessageCount).toBe(1);
  });

  it("2. allows ACK when duplicate reservation event is deduplicated", async () => {
    const request = buildSignedTransportRequest([
      buildTransportTestMessage({
        messageId: "msg-dup",
        kind: "reservation.create",
        connectionId: stack.connectionId,
        externalReservationId: "ext-dup-1",
        payload: DEFAULT_SIMULATED_FIXTURE,
      }),
    ]);

    const first = await stack.webhookTransportUseCase.execute(request);
    const second = await stack.webhookTransportUseCase.execute(request);

    expect(first.ackAllowed).toBe(true);
    expect(second.ackAllowed).toBe(true);
    expect(second.results[0]?.deduplicated).toBe(true);
  });

  it("3. allows ACK when multiple events all succeed durable Receive", async () => {
    const result = await stack.webhookTransportUseCase.execute(
      buildSignedTransportRequest([
        buildTransportTestMessage({
          messageId: "msg-multi-1",
          kind: "reservation.create",
          connectionId: stack.connectionId,
          externalReservationId: "ext-multi-1",
          payload: DEFAULT_SIMULATED_FIXTURE,
        }),
        buildTransportTestMessage({
          messageId: "msg-multi-2",
          kind: "reservation.modify",
          connectionId: stack.connectionId,
          externalReservationId: "ext-multi-2",
          payload: { externalRevision: "rev-1" },
        }),
      ]),
    );

    expect(result.ackAllowed).toBe(true);
    expect(result.results).toHaveLength(2);
  });

  it("4. denies ACK on partial batch Receive failure", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");
    receiveSpy
      .mockResolvedValueOnce(
        Result.ok({ inboxItemId: "inbox-1", deduplicated: false, jobId: "job-1" }),
      )
      .mockResolvedValueOnce(Result.fail(new Error("receive failed")));

    const result = await stack.webhookTransportUseCase.execute(
      buildSignedTransportRequest([
        buildTransportTestMessage({
          messageId: "msg-partial-1",
          kind: "reservation.create",
          connectionId: stack.connectionId,
          externalReservationId: "ext-partial-1",
        }),
        buildTransportTestMessage({
          messageId: "msg-partial-2",
          kind: "reservation.create",
          connectionId: stack.connectionId,
          externalReservationId: "ext-partial-2",
        }),
      ]),
    );

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("receive_failed");
  });

  it("5. denies ACK on verification failure without parse or Receive", async () => {
    const verifySpy = vi.spyOn(stack.webhookProvider, "verify");
    const parseSpy = vi.spyOn(stack.webhookProvider, "parse");
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const rawBody = "[]";
    const result = await stack.webhookTransportUseCase.execute(
      createChannelWebhookTransportRequest({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
        headers: { [TEST_WEBHOOK_SIGNATURE_HEADER]: "invalid" },
        rawBodyBytes: encodeChannelWebhookBody(rawBody),
      }),
    );

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("verification_failed");
    expect(verifySpy).toHaveBeenCalled();
    expect(parseSpy).not.toHaveBeenCalled();
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("6. denies ACK on parse failure without Receive", async () => {
    const parseSpy = vi.spyOn(stack.webhookProvider, "parse").mockRejectedValue(new Error("parse failed"));
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await stack.webhookTransportUseCase.execute(
      buildSignedTransportRequest([]),
    );

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("parse_failed");
    expect(parseSpy).toHaveBeenCalled();
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("7. rejects provenance mismatch with zero Receive calls", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await stack.webhookTransportUseCase.execute(
      buildSignedTransportRequest([
        buildTransportTestMessage({
          messageId: "msg-prov",
          kind: "reservation.create",
          connectionId: "other-connection",
          externalReservationId: "ext-prov",
        }),
      ]),
    );

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("provenance_mismatch");
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("8. denies ACK for malformed identity", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await stack.webhookTransportUseCase.execute(
      buildSignedTransportRequest([
        buildTransportTestMessage({
          messageId: "",
          kind: "reservation.unknown",
          connectionId: stack.connectionId,
          payload: {},
        }),
      ]),
    );

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("malformed_identity");
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("9. denies ACK for inactive connection", async () => {
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

    const result = await stack.webhookTransportUseCase.execute(
      buildSignedTransportRequest([
        buildTransportTestMessage({
          messageId: "msg-inactive",
          kind: "reservation.create",
          connectionId: stack.connectionId,
          externalReservationId: "ext-inactive",
        }),
      ]),
    );

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("inactive_connection");
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("10. denies ACK for provider mismatch", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");
    const registry = new ChannelProviderRegistry();
    registry.register({
      ...createTestChannelTransportProviderRegistration({
        webhookProvider: stack.webhookProvider,
      }),
      providerId: "booking_com",
    });

    const mismatchedUseCase = new HandleChannelWebhookTransportUseCase(
      registry,
      new ReceiveChannelWebhookBatchUseCase(
        stack.connectionRepository,
        stack.credentialResolver,
        registry,
        stack.batchProcessor,
      ),
    );

    const result = await mismatchedUseCase.execute(
      createChannelWebhookTransportRequest({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        provider: "booking_com",
        headers: {},
        rawBodyBytes: encodeChannelWebhookBody("[]"),
      }),
    );

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("provider_mismatch");
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("11. returns structured credential_unavailable when required refs are missing", async () => {
    const registry = new ChannelProviderRegistry();
    registry.register(
      createTestChannelTransportProviderRegistration({
        webhookAuthPolicy: {
          requiresVerification: true,
          requiresWebhookVerificationRef: true,
          requiresCredentialRef: true,
        },
      }),
    );

    const connectionRepository = new InMemoryChannelConnectionRepository();
    const connection = ChannelConnection.createDraft({
      id: stack.connectionId,
      tenantId: stack.tenantId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      displayName: "Missing credentials",
    });
    connection.attachCredentials(CredentialReference.create("cred_only"));
    connection.activate();
    await connectionRepository.create(connection);

    const useCase = new HandleChannelWebhookTransportUseCase(
      registry,
      new ReceiveChannelWebhookBatchUseCase(
        connectionRepository,
        stack.credentialResolver,
        registry,
        stack.batchProcessor,
      ),
    );

    const result = await useCase.execute(
      createChannelWebhookTransportRequest({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
        headers: {},
        rawBodyBytes: encodeChannelWebhookBody("[]"),
      }),
    );

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("credential_unavailable");
  });

  it("12. normalizes credential resolver throws without leaking secrets", async () => {
    class ThrowingCredentialResolver implements IChannelCredentialResolver {
      async resolveCredential(_reference: CredentialRef) {
        throw new Error("Failed to resolve credential secret-whsec_leaked");
      }
      async resolveWebhookVerification(_reference: WebhookRef) {
        throw new Error("Failed to resolve webhook secret");
      }
    }

    const registry = new ChannelProviderRegistry();
    registry.register(createTestChannelTransportProviderRegistration());

    const connectionRepository = new InMemoryChannelConnectionRepository();
    const connection = ChannelConnection.createDraft({
      id: stack.connectionId,
      tenantId: stack.tenantId,
      provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      displayName: "Resolver throws",
    });
    connection.attachWebhookVerification(WebhookVerificationReference.create("whsec_throw"));
    connection.attachCredentials(CredentialReference.create("cred_throw"));
    connection.activate();
    await connectionRepository.create(connection);

    const useCase = new HandleChannelWebhookTransportUseCase(
      registry,
      new ReceiveChannelWebhookBatchUseCase(
        connectionRepository,
        new ThrowingCredentialResolver(),
        registry,
        stack.batchProcessor,
      ),
    );

    const result = await useCase.execute(
      createChannelWebhookTransportRequest({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
        headers: {},
        rawBodyBytes: encodeChannelWebhookBody("[]"),
      }),
    );

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("credential_resolution_failed");
    expect(result.errorMessage).toBe("Transport processing failed");
    expect(result.errorMessage).not.toContain("whsec");
  });

  it("13. passes original raw body bytes to verification unchanged", async () => {
    const verifySpy = vi.spyOn(stack.webhookProvider, "verify");
    const messages = [
      buildTransportTestMessage({
        messageId: "msg-raw",
        kind: "reservation.create",
        connectionId: stack.connectionId,
        externalReservationId: "ext-raw",
        payload: DEFAULT_SIMULATED_FIXTURE,
      }),
    ];
    const rawBody = `  ${JSON.stringify(messages)}  `;
    const rawBodyBytes = encodeChannelWebhookBody(rawBody);

    const result = await stack.webhookTransportUseCase.execute(
      createChannelWebhookTransportRequest({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
        headers: {
          [TEST_WEBHOOK_SIGNATURE_HEADER]: buildTestWebhookSignature(
            "test-webhook-secret",
            rawBody,
          ),
        },
        rawBodyBytes,
      }),
    );

    expect(result.ackAllowed).toBe(true);
    const verifyArg = verifySpy.mock.calls[0]?.[0];
    expect(verifyArg?.rawBodyBytes).toEqual(rawBodyBytes);
    expect(decodeUtf8Bytes(verifyArg!.rawBodyBytes)).toBe(rawBody);
  });

  it("14. parses only after successful verification", async () => {
    const callOrder: string[] = [];
    vi.spyOn(stack.webhookProvider, "verify").mockImplementation(async (request) => {
      callOrder.push("verify");
      return { accepted: true, connectionId: stack.connectionId };
    });
    vi.spyOn(stack.webhookProvider, "parse").mockImplementation(async () => {
      callOrder.push("parse");
      return [];
    });

    await stack.webhookTransportUseCase.execute(buildSignedTransportRequest([]));

    expect(callOrder).toEqual(["verify", "parse"]);
  });

  it("15. allows ACK for connectivity.test with ack_without_persist without Receive", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await stack.webhookTransportUseCase.execute(
      buildSignedTransportRequest([
        buildTransportTestMessage({
          messageId: "msg-maint",
          kind: "connectivity.test",
          connectionId: stack.connectionId,
          payload: { providerEventId: "maint-evt-1" },
        }),
      ]),
    );

    expect(result.ackAllowed).toBe(true);
    expect(receiveSpy).not.toHaveBeenCalled();
    expect(result.persistedMessageCount).toBe(0);
  });

  it("16. never bypasses Receive for reservation events alongside maintenance policy", async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await stack.webhookTransportUseCase.execute(
      buildSignedTransportRequest([
        buildTransportTestMessage({
          messageId: "msg-maint-with-res",
          kind: "connectivity.test",
          connectionId: stack.connectionId,
          payload: { providerEventId: "maint-evt-2" },
        }),
        buildTransportTestMessage({
          messageId: "msg-res-with-maint",
          kind: "reservation.modify",
          connectionId: stack.connectionId,
          externalReservationId: "ext-mod-maint",
          payload: { externalRevision: "rev-maint" },
        }),
      ]),
    );

    expect(result.ackAllowed).toBe(true);
    expect(receiveSpy).toHaveBeenCalledTimes(1);
  });

  it('17. acknowledges an empty valid batch after verify/parse with zero Receive calls', async () => {
    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await stack.webhookTransportUseCase.execute(buildSignedTransportRequest([]));

    expect(result.ackAllowed).toBe(true);
    expect(result.receivedMessageCount).toBe(0);
    expect(result.persistedMessageCount).toBe(0);
    expect(receiveSpy).not.toHaveBeenCalled();
  });

  it("18. denies ACK on unexpected Receive error", async () => {
    vi.spyOn(stack.receiveChannelEventUseCase, "execute").mockResolvedValue(
      Result.fail(new Error("unexpected receive infrastructure failure")),
    );

    const result = await stack.webhookTransportUseCase.execute(
      buildSignedTransportRequest([
        buildTransportTestMessage({
          messageId: "msg-receive-fail",
          kind: "reservation.create",
          connectionId: stack.connectionId,
          externalReservationId: "ext-receive-fail",
        }),
      ]),
    );

    expect(result.ackAllowed).toBe(false);
    expect(result.failureKind).toBe("receive_failed");
  });

  it('receives connectivity.test when maintenance policy is "receive"', async () => {
    const registry = new ChannelProviderRegistry();
    registry.register(
      createTestChannelTransportProviderRegistration({
        maintenanceEventPolicy: { connectivityTestIngress: "receive" },
      }),
    );

    const useCase = new HandleChannelWebhookTransportUseCase(
      registry,
      new ReceiveChannelWebhookBatchUseCase(
        stack.connectionRepository,
        stack.credentialResolver,
        registry,
        stack.batchProcessor,
      ),
    );

    const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase, "execute");

    const result = await useCase.execute(
      buildSignedTransportRequest([
        buildTransportTestMessage({
          messageId: "msg-maint-receive",
          kind: "connectivity.test",
          connectionId: stack.connectionId,
          payload: { providerEventId: "maint-receive-1" },
        }),
      ]),
    );

    expect(result.ackAllowed).toBe(true);
    expect(receiveSpy).toHaveBeenCalledTimes(1);
  });
});

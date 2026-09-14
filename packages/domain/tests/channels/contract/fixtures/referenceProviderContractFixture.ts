import { DEFAULT_SIMULATED_FIXTURE } from "../../../../src/channels/simulation/SimulatedReservationFixtures";
import {
  buildTestWebhookSignature,
  TEST_WEBHOOK_SIGNATURE_HEADER,
} from "../../../../src/channels/simulation/TestChannelWebhookProvider";
import {
  createTestChannelTransportProviderRegistration,
  TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
} from "../../../../src/channels/simulation/TestChannelTransportProviderBundle";
import type {
  CombinedProviderContractFixture,
  SharedProviderContractExpectations,
} from "../../../../src/channels/contract/ProviderContractFixtureTypes";
import { deriveProviderContractEligibility } from "../../../../src/channels/contract/ProviderContractEligibility";
import {
  createChannelWebhookTransportRequest,
  encodeChannelWebhookBody,
} from "../../../../src/channels/types/ChannelWebhookTransportRequest";
import { buildTransportTestMessage } from "../../fixtures/testChannelTransportFixtures";
import { createChannelIngressTestStack } from "../../helpers/channelIngressTestStack";
import type { ChannelProviderMessage } from "../../../../src/channels/types/ChannelProviderMessage";
import { buildReservationUnknownMessage } from "../../../../src/channels/types/buildReservationUnknownMessage";
import { Result } from "../../../../src/shared/kernel/Result";
import { vi } from "vitest";

const WEBHOOK_SECRET = "contract-webhook-secret";

const REFERENCE_UNKNOWN_CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440201";

/** Taxonomy used by reference fixtures for unsupported reinstated events (S0b). */
export const REFERENCE_UNKNOWN_CLASSIFICATION = {
  taxonomyVersion: 1 as const,
  category: "ambiguous_reservation" as const,
  reasonCode: "unsupported_provider_event",
  reclassifiable: false,
};

export function buildReferenceUnknownReservationMessage(): ChannelProviderMessage {
  const result = buildReservationUnknownMessage({
    messageId: "contract-unknown-1",
    connectionId: REFERENCE_UNKNOWN_CONNECTION_ID,
    provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
    receivedAt: new Date("2027-06-01T00:00:00.000Z"),
    externalReservationId: "ext-reinstated-1",
    classification: REFERENCE_UNKNOWN_CLASSIFICATION,
    evidencePayload: {
      providerEventType: "reservation.reinstated",
      providerEventId: "evt-reinstated-1",
    },
  });
  if (result.isFailure) {
    throw result.getError();
  }
  return result.getValue();
}

/**
 * Legacy unknown message without taxonomy envelope (compatibility fixture only).
 * New provider fixtures must not use this path.
 */
export function buildLegacyUnknownReservationMessageWithoutTaxonomy(): ChannelProviderMessage {
  return buildTransportTestMessage({
    messageId: "contract-unknown-legacy-1",
    kind: "reservation.unknown",
    externalReservationId: "ext-reinstated-1",
    payload: {
      providerEventType: "reservation.reinstated",
      providerEventId: "evt-reinstated-1",
    },
  });
}

export function buildSharedReservationExpectations(): SharedProviderContractExpectations {
  const expectedReservationMessages = {
    create: buildTransportTestMessage({
      messageId: "contract-create-1",
      kind: "reservation.create",
      externalReservationId: "ext-contract-create-1",
      payload: DEFAULT_SIMULATED_FIXTURE,
    }),
    modify: buildTransportTestMessage({
      messageId: "contract-modify-1",
      kind: "reservation.modify",
      externalReservationId: "ext-contract-modify-1",
      payload: { externalRevision: "rev-mod-1" },
    }),
    cancel: buildTransportTestMessage({
      messageId: "contract-cancel-1",
      kind: "reservation.cancel",
      externalReservationId: "ext-contract-cancel-1",
      payload: { externalRevision: "rev-cancel-1" },
    }),
    unknown: buildReferenceUnknownReservationMessage(),
  };

  return {
    expectedReservationMessages,
    expectedSourceEvents: [
      {
        sourceEventId: "src-create-1",
        reservationRelated: true,
        expectedNormalizedKind: "reservation.create",
        expectedExternalReservationId: "ext-contract-create-1",
      },
    ],
  };
}

export function createReferenceProviderContractFixture(): CombinedProviderContractFixture {
  const registration = createTestChannelTransportProviderRegistration();
  const eligibility = deriveProviderContractEligibility(registration, {
    webhookVerification: "signed_raw_body",
    pollingCursor: "cursor",
    maintenanceAckWithoutPersist: true,
    destructiveCursor: false,
  });

  const expectations = buildSharedReservationExpectations();
  const { expectedReservationMessages } = expectations;

  return {
    label: "reference-test-channel-provider",
    eligibility,
    registration,
    expectations,
    createStack: async () => {
      const stack = await createChannelIngressTestStack({ webhookSecret: WEBHOOK_SECRET });
      stack.cursorRepository.clear();
      return {
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        registration,
        webhookTransportUseCase: stack.webhookTransportUseCase,
        pollConnectionUseCase: stack.pollConnectionUseCase,
        inboxRepository: stack.inboxRepository,
        receiveChannelEventUseCase: stack.receiveChannelEventUseCase,
        credentialResolver: stack.credentialResolver,
        pollingProvider: stack.pollingProvider,
        webhookProvider: stack.webhookProvider,
        cursorRepository: stack.cursorRepository,
        jobScheduler: stack.jobScheduler,
      };
    },
    webhook: {
      buildValidSignedRequest: (stack) =>
        buildSignedRequest(stack, [expectedReservationMessages.create]),
      buildDuplicateSignedRequest: (stack) =>
        buildSignedRequest(stack, [expectedReservationMessages.create]),
      buildInvalidSignatureRequest: (stack) => {
        const request = buildSignedRequest(stack, [expectedReservationMessages.create]);
        return {
          ...request,
          headers: { ...request.headers, [TEST_WEBHOOK_SIGNATURE_HEADER]: "invalid" },
        };
      },
      buildMalformedRequest: (stack) => {
        const rawBody = "not-json";
        return createChannelWebhookTransportRequest({
          tenantId: stack.tenantId,
          connectionId: stack.connectionId,
          provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
          headers: {
            [TEST_WEBHOOK_SIGNATURE_HEADER]: buildTestWebhookSignature(WEBHOOK_SECRET, rawBody),
          },
          rawBodyBytes: encodeChannelWebhookBody(rawBody),
        });
      },
      buildUnknownReservationRequest: (stack) => {
        stack.webhookProvider?.setParseHandler?.(async () => [expectedReservationMessages.unknown]);
        return buildSignedRequest(stack, [expectedReservationMessages.unknown]);
      },
      buildInvalidKindRequest: (stack) => {
        stack.webhookProvider?.setParseHandler?.(async () => [
          {
            ...expectedReservationMessages.create,
            kind: "reservation.reinstated" as ChannelProviderMessage["kind"],
          },
        ]);
        return buildSignedRequest(stack, []);
      },
      buildMaintenanceRequest: (stack) => {
        const maintenance = buildTransportTestMessage({
          messageId: "contract-maint-1",
          kind: "connectivity.test",
          payload: { providerEventId: "maint-1" },
        });
        stack.webhookProvider?.setParseHandler?.(async () => [maintenance]);
        return buildSignedRequest(stack, [maintenance]);
      },
    },
    polling: {
      expectedProposedCursor: "cursor-1",
      seedInitialPoll: (stack) => {
        stack.pollingProvider?.seedCursorMessages(null, [expectedReservationMessages.create]);
      },
      seedDuplicatePoll: (stack) => {
        stack.pollingProvider?.seedCursorMessages(null, [expectedReservationMessages.create]);
      },
      seedReservationKindPoll: (stack, kind, cursor = null) => {
        stack.pollingProvider?.seedCursorMessages(cursor, [expectedReservationMessages[kind]]);
      },
      seedEmptyPoll: (stack) => {
        stack.pollingProvider?.seedCursorMessages(null, []);
      },
      seedConcurrentPollScenario: (stack) => {
        stack.pollingProvider?.seedCursorMessages("P0", [expectedReservationMessages.create]);
        vi.spyOn(stack.pollingProvider!, "poll").mockResolvedValueOnce({
          messages: [expectedReservationMessages.create],
          nextCursor: "P2",
        });
      },
      seedPartialBatchPoll: (stack) => {
        stack.pollingProvider?.seedCursorMessages(null, [
          expectedReservationMessages.create,
          expectedReservationMessages.modify,
        ]);
        vi.spyOn(stack.receiveChannelEventUseCase!, "execute")
          .mockResolvedValueOnce(Result.ok({ deduplicated: false, inboxItemId: "inbox-1" }))
          .mockResolvedValueOnce(Result.fail(new Error("Receive failed")));
      },
    },
  };
}

function buildSignedRequest(
  stack: { tenantId: string; connectionId: string },
  messages: ChannelProviderMessage[],
) {
  const rawBody = JSON.stringify(messages);
  return createChannelWebhookTransportRequest({
    tenantId: stack.tenantId,
    connectionId: stack.connectionId,
    provider: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
    headers: {
      [TEST_WEBHOOK_SIGNATURE_HEADER]: buildTestWebhookSignature(WEBHOOK_SECRET, rawBody),
    },
    rawBodyBytes: encodeChannelWebhookBody(rawBody),
  });
}

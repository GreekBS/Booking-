import { createProviderCapabilities } from "../../../../src/channels/types/ChannelCapabilities";
import { withDefaultProviderRegistrationPolicies } from "../../../../src/channels/ports/providers/ChannelProviderRegistration";
import { TestChannelPollingProvider } from "../../../../src/channels/simulation/TestChannelPollingProvider";
import { TEST_CHANNEL_TRANSPORT_PROVIDER_ID } from "../../../../src/channels/simulation/TestChannelTransportProviderBundle";
import type { PollingProviderContractFixture } from "../../../../src/channels/contract/ProviderContractFixtureTypes";
import { deriveProviderContractEligibility } from "../../../../src/channels/contract/ProviderContractEligibility";
import { createChannelIngressTestStack } from "../../helpers/channelIngressTestStack";
import { buildSharedReservationExpectations } from "./referenceProviderContractFixture";
import { Result } from "../../../../src/shared/kernel/Result";
import { vi } from "vitest";

export function createReferencePollingOnlyProviderContractFixture(
  overrides: {
    destructiveCursor?: boolean;
    expectedSourceEvents?: PollingProviderContractFixture["expectations"]["expectedSourceEvents"];
    omitDeclaredSourcesOnPoll?: boolean;
  } = {},
): PollingProviderContractFixture {
  const pollingProvider = new TestChannelPollingProvider();
  const registration = withDefaultProviderRegistrationPolicies({
    providerId: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
    capabilities: createProviderCapabilities({
      inbound: {
        webhooks: false,
        polling: true,
        reservationImport: false,
      },
      connectionAuth: false,
    }),
    status: "active",
    auth: null,
    webhooks: null,
    polling: pollingProvider,
    reservationImport: null,
    availabilityExport: null,
    rateRestrictionExport: null,
    reservationExport: null,
    pollAuthPolicy: {
      requiresCredentialRef: true,
    },
    maintenanceEventPolicy: {
      connectivityTestIngress: "ack_without_persist",
    },
  });

  const eligibility = deriveProviderContractEligibility(registration, {
    pollingCursor: "cursor",
    destructiveCursor: overrides.destructiveCursor ?? false,
  });

  const baseExpectations = buildSharedReservationExpectations();
  const expectations = {
    ...baseExpectations,
    expectedSourceEvents:
      overrides.expectedSourceEvents !== undefined
        ? overrides.expectedSourceEvents
        : baseExpectations.expectedSourceEvents,
  };
  const { expectedReservationMessages } = expectations;

  return {
    label: "reference-polling-only-provider",
    eligibility,
    registration,
    expectations,
    createStack: async () => {
      const stack = await createChannelIngressTestStack({
        registration,
        providerId: TEST_CHANNEL_TRANSPORT_PROVIDER_ID,
      });
      stack.cursorRepository.clear();
      return {
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
        registration,
        pollConnectionUseCase: stack.pollConnectionUseCase,
        inboxRepository: stack.inboxRepository,
        receiveChannelEventUseCase: stack.receiveChannelEventUseCase,
        credentialResolver: stack.credentialResolver,
        pollingProvider: stack.pollingProvider,
        cursorRepository: stack.cursorRepository,
        jobScheduler: stack.jobScheduler,
      };
    },
    polling: {
      expectedProposedCursor: "cursor-1",
      seedInitialPoll: (stack) => {
        if (overrides.omitDeclaredSourcesOnPoll) {
          stack.pollingProvider?.seedCursorMessages(null, []);
          return;
        }
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

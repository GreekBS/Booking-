import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { ChannelProviderRegistration } from "../ports/providers/ChannelProviderRegistration";
import type { ChannelWebhookTransportRequest } from "../types/ChannelWebhookTransportRequest";
import type { ProviderContractEligibility } from "./ProviderContractEligibility";

export interface ProviderContractStack {
  tenantId: string;
  connectionId: string;
  registration: ChannelProviderRegistration;
  webhookTransportUseCase?: {
    execute(request: ChannelWebhookTransportRequest): Promise<{
      ackAllowed: boolean;
      errorMessage?: string;
      results: Array<{ deduplicated?: boolean; success: boolean }>;
    }>;
  };
  pollConnectionUseCase?: {
    execute(command: { tenantId: string; connectionId: string }): Promise<{
      ackAllowed: boolean;
      shouldRetryJob: boolean;
      cursorAdvanced: boolean;
      cursorReconciliation: string;
      proposedNextCursor: string | null;
      errorMessage?: string;
      results: Array<{ deduplicated?: boolean; success: boolean }>;
    }>;
  };
  inboxRepository: {
    listByConnection?(tenantId: string, connectionId: string): Promise<unknown[]>;
    findAll?(): unknown[];
    listAllForTest?(): unknown[];
    items?: unknown[];
  };
  receiveChannelEventUseCase?: { execute: (...args: unknown[]) => unknown };
  credentialResolver?: unknown;
  pollingProvider?: {
    seedCursorMessages(cursor: string | null, messages: ChannelProviderMessage[]): void;
    poll?: (...args: unknown[]) => unknown;
  };
  webhookProvider?: {
    setParseHandler?: (
      handler: ((payload: unknown) => Promise<ChannelProviderMessage[]>) | null,
    ) => void;
  };
  cursorRepository?: unknown;
  jobScheduler?: { jobs: Map<string, unknown> };
}

/**
 * Declared provider source event the harness expects to appear as Inbox evidence
 * when `reservationRelated` is true.
 *
 * Undeclared external events cannot be detected by the platform.
 */
export interface ExpectedSourceEvent {
  sourceEventId: string;
  reservationRelated: boolean;
  expectedNormalizedKind?: ChannelProviderMessage["kind"];
  expectedProviderEventId?: string;
  expectedExternalReservationId?: string;
}

/** Provider-neutral expectations shared by webhook and polling fixtures. */
export interface SharedProviderContractExpectations {
  expectedReservationMessages: {
    create: ChannelProviderMessage;
    modify: ChannelProviderMessage;
    cancel: ChannelProviderMessage;
    unknown: ChannelProviderMessage;
  };
  /**
   * Optional declared source events for silent-drop conformance.
   * When omitted or empty, an empty provider batch may pass.
   */
  expectedSourceEvents?: ExpectedSourceEvent[];
}

export interface ProviderContractFixtureBase {
  label: string;
  eligibility: ProviderContractEligibility;
  registration: ChannelProviderRegistration;
  createStack: () => Promise<ProviderContractStack>;
  expectations: SharedProviderContractExpectations;
}

export interface WebhookTransportFixtureMethods {
  buildValidSignedRequest: (stack: ProviderContractStack) => ChannelWebhookTransportRequest;
  buildDuplicateSignedRequest: (stack: ProviderContractStack) => ChannelWebhookTransportRequest;
  buildInvalidSignatureRequest: (stack: ProviderContractStack) => ChannelWebhookTransportRequest;
  buildMalformedRequest: (stack: ProviderContractStack) => ChannelWebhookTransportRequest;
  buildMaintenanceRequest?: (stack: ProviderContractStack) => ChannelWebhookTransportRequest;
  buildUnknownReservationRequest: (stack: ProviderContractStack) => ChannelWebhookTransportRequest;
  buildInvalidKindRequest?: (stack: ProviderContractStack) => ChannelWebhookTransportRequest;
}

export interface PollingTransportFixtureMethods {
  seedInitialPoll: (stack: ProviderContractStack) => void;
  seedDuplicatePoll: (stack: ProviderContractStack) => void;
  seedReservationKindPoll: (
    stack: ProviderContractStack,
    kind: "create" | "modify" | "cancel" | "unknown",
    cursor?: string | null,
  ) => void;
  seedEmptyPoll: (stack: ProviderContractStack) => void;
  seedConcurrentPollScenario?: (stack: ProviderContractStack) => void;
  seedPartialBatchPoll?: (stack: ProviderContractStack) => void;
  expectedProposedCursor: string | null;
}

export type WebhookProviderContractFixture = ProviderContractFixtureBase & {
  webhook: WebhookTransportFixtureMethods;
};

export type PollingProviderContractFixture = ProviderContractFixtureBase & {
  polling: PollingTransportFixtureMethods;
};

export type CombinedProviderContractFixture = ProviderContractFixtureBase & {
  webhook?: WebhookTransportFixtureMethods;
  polling?: PollingTransportFixtureMethods;
};

/** Any fixture accepted by capability-driven contract entry points. */
export type ProviderContractFixture =
  | WebhookProviderContractFixture
  | PollingProviderContractFixture
  | CombinedProviderContractFixture;

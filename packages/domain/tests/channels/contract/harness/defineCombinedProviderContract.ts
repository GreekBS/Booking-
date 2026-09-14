import { describe } from "vitest";
import type {
  CombinedProviderContractFixture,
  PollingProviderContractFixture,
  ProviderContractFixture,
  WebhookProviderContractFixture,
} from "../../../../src/channels/contract/ProviderContractFixtureTypes";
import { runCrossTransportRaceSuite } from "./suites/crossTransportRace.suite";
import { runIdentityDedupContractSuite } from "./suites/identityDedupContract.suite";
import { runPollingContractSuite } from "./suites/pollingContract.suite";
import { runSecurityCredentialContractSuite } from "./suites/securityCredentialContract.suite";
import {
  runUniversalReservationInvariantsSuite,
  runUnknownEventPolicySuite,
} from "./suites/universalReservationInvariants.suite";
import { runUtf8RawBodyContractSuite } from "./suites/utf8RawBodyContract.suite";
import { runWebhookContractSuite } from "./suites/webhookContract.suite";

function runMandatorySharedSuites(fixture: ProviderContractFixture): void {
  runUniversalReservationInvariantsSuite(fixture);
  runUnknownEventPolicySuite(fixture);
  runIdentityDedupContractSuite(fixture);
  runSecurityCredentialContractSuite(fixture);
  runUtf8RawBodyContractSuite();
}

export function defineWebhookProviderContract(fixture: WebhookProviderContractFixture): void {
  describe(`Webhook provider contract: ${fixture.label}`, () => {
    runMandatorySharedSuites(fixture);
    runWebhookContractSuite(fixture);
  });
}

export function definePollingProviderContract(fixture: PollingProviderContractFixture): void {
  describe(`Polling provider contract: ${fixture.label}`, () => {
    runMandatorySharedSuites(fixture);
    runPollingContractSuite(fixture);
  });
}

export function defineCombinedProviderContract(fixture: CombinedProviderContractFixture): void {
  describe(`Combined provider contract: ${fixture.label}`, () => {
    runMandatorySharedSuites(fixture);
    runWebhookContractSuite(fixture);
    runPollingContractSuite(fixture);
    runCrossTransportRaceSuite(fixture);
  });
}

export type {
  CombinedProviderContractFixture,
  PollingProviderContractFixture,
  ProviderContractFixture,
  WebhookProviderContractFixture,
} from "../../../../src/channels/contract/ProviderContractFixtureTypes";
export { deriveProviderContractEligibility } from "../../../../src/channels/contract/ProviderContractEligibility";

import { definePollingProviderContract } from "./harness/defineCombinedProviderContract";
import { createReferencePollingOnlyProviderContractFixture } from "./fixtures/referencePollingOnlyProviderContractFixture";

definePollingProviderContract(createReferencePollingOnlyProviderContractFixture());

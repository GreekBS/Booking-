import { defineCombinedProviderContract } from "./harness/defineCombinedProviderContract";
import { createReferenceProviderContractFixture } from "./fixtures/referenceProviderContractFixture";

defineCombinedProviderContract(createReferenceProviderContractFixture());

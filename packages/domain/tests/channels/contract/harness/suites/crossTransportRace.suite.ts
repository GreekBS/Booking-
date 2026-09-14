import { describe, expect, it } from "vitest";
import type { CombinedProviderContractFixture } from "../../../../../src/channels/contract/ProviderContractFixtureTypes";
import { ChannelInboxDeduplicationKey } from "../../../../../src/channels/domain/value-objects/ChannelInboxDeduplicationKey";

export function runCrossTransportRaceSuite(fixture: CombinedProviderContractFixture): void {
  if (
    !fixture.webhook ||
    !fixture.polling ||
    !fixture.eligibility.webhookCapable ||
    !fixture.eligibility.pollingCapable
  ) {
    return;
  }

  describe("cross-transport race contract", () => {
    it("deduplicates webhook and poll delivery of the same reservation.create", async () => {
      const stack = await fixture.createStack();
      const message = fixture.expectations.expectedReservationMessages.create;
      const dedupKey = ChannelInboxDeduplicationKey.forIngressMessage(
        stack.connectionId,
        message,
      ).value;

      stack.pollingProvider?.seedCursorMessages(null, [message]);
      const webhookResult = await stack.webhookTransportUseCase!.execute(
        fixture.webhook.buildValidSignedRequest(stack),
      );
      const pollResult = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });

      expect(webhookResult.ackAllowed).toBe(true);
      expect(pollResult.ackAllowed).toBe(true);
      expect(pollResult.results[0]?.deduplicated ?? webhookResult.results[0]?.deduplicated).toBe(
        true,
      );

      const repo = stack.inboxRepository as {
        findByDeduplicationKey?: (
          tenantId: string,
          key: string,
        ) => Promise<unknown | null>;
        listAllForTest?: () => unknown[];
      };
      if (repo.findByDeduplicationKey) {
        const item = await repo.findByDeduplicationKey(stack.tenantId, dedupKey);
        expect(item).not.toBeNull();
      }
      if (repo.listAllForTest) {
        expect(repo.listAllForTest().length).toBe(1);
      }
    });
  });
}

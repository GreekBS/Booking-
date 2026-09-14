import { describe, expect, it } from "vitest";
import type { ProviderContractFixture } from "../../../../../src/channels/contract/ProviderContractFixtureTypes";
import {
  assertCancelDedupKey,
  assertColonInIdentifierAccepted,
  assertConnectionIsolation,
  assertCreateDedupKey,
  assertCrossTransportDedupKeyParity,
  assertMaintenanceDedupKey,
  assertModifyDedupKey,
  assertUnknownDedupKey,
} from "../assertions/dedupAssertions";

export function runIdentityDedupContractSuite(fixture: ProviderContractFixture): void {
  describe("identity and dedup contract", () => {
    it("builds create dedup keys", () => {
      assertCreateDedupKey("conn-1", "ext:res-1");
      assertColonInIdentifierAccepted("conn-1", "ext:res:1");
    });

    it("builds modify and cancel dedup keys", () => {
      assertModifyDedupKey("conn-1", "ext-1", "rev-1");
      assertCancelDedupKey("conn-1", "ext-2", "msg-2");
    });

    it("builds unknown and maintenance dedup keys", () => {
      assertUnknownDedupKey("conn-1", "evt-unknown");
      assertMaintenanceDedupKey("conn-1", "connectivity.test", "maint-1");
    });

    it("isolates dedup keys by connection", () => {
      assertConnectionIsolation("conn-a", "conn-b", "ext-shared");
    });

    it("supports webhook/poll parity for create messages", async () => {
      if (
        !fixture.eligibility.webhookCapable ||
        !fixture.eligibility.pollingCapable ||
        !("webhook" in fixture) ||
        !fixture.webhook ||
        !("polling" in fixture) ||
        !fixture.polling
      ) {
        return;
      }
      const stack = await fixture.createStack();
      const message = fixture.expectations.expectedReservationMessages.create;
      assertCrossTransportDedupKeyParity(stack.connectionId, message);
    });

    it("deduplicates stable retries for create ingress via webhook", async () => {
      if (!fixture.eligibility.webhookCapable || !("webhook" in fixture) || !fixture.webhook) {
        return;
      }
      const stack = await fixture.createStack();
      const request = fixture.webhook.buildDuplicateSignedRequest(stack);
      const first = await stack.webhookTransportUseCase!.execute(request);
      const second = await stack.webhookTransportUseCase!.execute(request);
      expect(first.ackAllowed).toBe(true);
      expect(second.ackAllowed).toBe(true);
      expect(second.results[0]?.deduplicated).toBe(true);
    });

    it("deduplicates stable retries for create ingress via polling", async () => {
      if (!fixture.eligibility.pollingCapable || !("polling" in fixture) || !fixture.polling) {
        return;
      }
      const stack = await fixture.createStack();
      const message = fixture.expectations.expectedReservationMessages.create;
      fixture.polling.seedDuplicatePoll(stack);
      const first = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      const cursorRepo = stack.cursorRepository as {
        getCursor: (tenantId: string, connectionId: string) => Promise<{ payload: string } | null>;
      };
      const cursor = await cursorRepo.getCursor(stack.tenantId, stack.connectionId);
      stack.pollingProvider?.seedCursorMessages(cursor?.payload ?? "cursor-1", [message]);
      const second = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(first.ackAllowed).toBe(true);
      expect(second.ackAllowed).toBe(true);
      expect(second.results[0]?.deduplicated).toBe(true);
    });
  });
}

import { describe, expect, it, vi } from "vitest";
import { Result } from "../../../../../src/shared/kernel/Result";
import type { ProviderContractFixture } from "../../../../../src/channels/contract/ProviderContractFixtureTypes";
import { assertAckOnlyAfterDurableReceive } from "../assertions/invariantAssertions";
import { assertNoSecretLeakage } from "../assertions/securityAssertions";

export function runWebhookContractSuite(fixture: ProviderContractFixture): void {
  if (!fixture.eligibility.webhookCapable) {
    return;
  }
  if (!("webhook" in fixture) || fixture.webhook == null) {
    describe("webhook provider contract", () => {
      it("requires webhook fixture section when webhookCapable", () => {
        expect.fail("webhookCapable eligibility requires a webhook fixture section");
      });
    });
    return;
  }

  const webhook = fixture.webhook;

  describe("webhook provider contract", () => {
    it("allows ACK after durable Receive for valid signed request", async () => {
      const stack = await fixture.createStack();
      const result = await stack.webhookTransportUseCase!.execute(
        webhook.buildValidSignedRequest(stack),
      );
      expect(result.ackAllowed).toBe(true);
      assertAckOnlyAfterDurableReceive(result);
    });

    it("denies ACK on invalid signature", async () => {
      const stack = await fixture.createStack();
      const result = await stack.webhookTransportUseCase!.execute(
        webhook.buildInvalidSignatureRequest(stack),
      );
      expect(result.ackAllowed).toBe(false);
    });

    it("denies ACK on malformed payload", async () => {
      const stack = await fixture.createStack();
      const result = await stack.webhookTransportUseCase!.execute(
        webhook.buildMalformedRequest(stack),
      );
      expect(result.ackAllowed).toBe(false);
    });

    it("denies ACK on partial batch Receive failure", async () => {
      const stack = await fixture.createStack();
      const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase!, "execute");
      receiveSpy
        .mockResolvedValueOnce(Result.ok({ deduplicated: false, inboxItemId: "inbox-1" }))
        .mockResolvedValueOnce(Result.fail(new Error("Receive failed")));
      stack.webhookProvider?.setParseHandler?.(async () => [
        fixture.expectations.expectedReservationMessages.create,
        fixture.expectations.expectedReservationMessages.modify,
      ]);
      const result = await stack.webhookTransportUseCase!.execute(
        webhook.buildValidSignedRequest(stack),
      );
      expect(result.ackAllowed).toBe(false);
    });

    it("sanitizes credential-related failures", async () => {
      const stack = await fixture.createStack();
      const resolver = stack.credentialResolver as {
        resolveWebhookVerification: (...args: unknown[]) => Promise<unknown>;
      };
      vi.spyOn(resolver, "resolveWebhookVerification").mockRejectedValueOnce(
        new Error("Failed to resolve whsec_test"),
      );
      const result = await stack.webhookTransportUseCase!.execute(
        webhook.buildValidSignedRequest(stack),
      );
      expect(result.ackAllowed).toBe(false);
      assertNoSecretLeakage(result.errorMessage);
    });

    it("allows maintenance ack_without_persist without Inbox when configured", async () => {
      if (!fixture.eligibility.maintenanceAckWithoutPersist || !webhook.buildMaintenanceRequest) {
        return;
      }
      const stack = await fixture.createStack();
      const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase!, "execute");
      const result = await stack.webhookTransportUseCase!.execute(
        webhook.buildMaintenanceRequest(stack),
      );
      expect(result.ackAllowed).toBe(true);
      expect(receiveSpy).not.toHaveBeenCalled();
    });
  });
}

import { describe, expect, it, vi } from "vitest";
import type { ProviderContractFixture } from "../../../../../src/channels/contract/ProviderContractFixtureTypes";
import {
  assertInboxPayloadHasNoCredentials,
  assertJobPayloadHasNoCredentials,
  assertNoSecretLeakage,
} from "../assertions/securityAssertions";

export function runSecurityCredentialContractSuite(fixture: ProviderContractFixture): void {
  describe("security and credential contract", () => {
    it("never leaks secrets in webhook transport errors", async () => {
      if (!fixture.eligibility.webhookCapable || !("webhook" in fixture) || !fixture.webhook) {
        return;
      }
      const stack = await fixture.createStack();
      vi.spyOn(
        stack.credentialResolver as {
          resolveWebhookVerification: (...args: unknown[]) => Promise<unknown>;
        },
        "resolveWebhookVerification",
      ).mockRejectedValueOnce(new Error("Bearer secret-token-123 failed"));
      const result = await stack.webhookTransportUseCase!.execute(
        fixture.webhook.buildValidSignedRequest(stack),
      );
      assertNoSecretLeakage(result.errorMessage);
    });

    it("never leaks secrets in polling credential failures", async () => {
      if (!fixture.eligibility.pollingCapable || !("polling" in fixture) || !fixture.polling) {
        return;
      }
      const stack = await fixture.createStack();
      vi.spyOn(
        stack.credentialResolver as {
          resolveCredential: (...args: unknown[]) => Promise<unknown>;
        },
        "resolveCredential",
      ).mockRejectedValueOnce(new Error("Bearer secret-token-123 failed"));
      fixture.polling.seedInitialPoll(stack);
      const result = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(result.ackAllowed).toBe(false);
      assertNoSecretLeakage(result.errorMessage);
    });

    it("does not persist credentials in Inbox payloads", async () => {
      if (fixture.eligibility.pollingCapable && "polling" in fixture && fixture.polling) {
        const stack = await fixture.createStack();
        fixture.polling.seedInitialPoll(stack);
        await stack.pollConnectionUseCase!.execute({
          tenantId: stack.tenantId,
          connectionId: stack.connectionId,
        });
        const repo = stack.inboxRepository as {
          listAllForTest?: () => Array<{ rawPayload: Record<string, unknown> }>;
        };
        for (const item of repo.listAllForTest?.() ?? []) {
          assertInboxPayloadHasNoCredentials(item.rawPayload);
        }
        return;
      }
      if (!fixture.eligibility.webhookCapable || !("webhook" in fixture) || !fixture.webhook) {
        return;
      }
      const stack = await fixture.createStack();
      await stack.webhookTransportUseCase!.execute(fixture.webhook.buildValidSignedRequest(stack));
      const repo = stack.inboxRepository as {
        listAllForTest?: () => Array<{ rawPayload: Record<string, unknown> }>;
      };
      for (const item of repo.listAllForTest?.() ?? []) {
        assertInboxPayloadHasNoCredentials(item.rawPayload);
      }
    });

    it("does not enqueue credentials in background job payloads", async () => {
      if (fixture.eligibility.pollingCapable && "polling" in fixture && fixture.polling) {
        const stack = await fixture.createStack();
        fixture.polling.seedInitialPoll(stack);
        await stack.pollConnectionUseCase!.execute({
          tenantId: stack.tenantId,
          connectionId: stack.connectionId,
        });
        const jobs = stack.jobScheduler?.jobs;
        if (!jobs) {
          return;
        }
        for (const job of jobs.values()) {
          assertJobPayloadHasNoCredentials(job as { payload?: Record<string, unknown> });
        }
        return;
      }
      if (!fixture.eligibility.webhookCapable || !("webhook" in fixture) || !fixture.webhook) {
        return;
      }
      const stack = await fixture.createStack();
      await stack.webhookTransportUseCase!.execute(fixture.webhook.buildValidSignedRequest(stack));
      const jobs = stack.jobScheduler?.jobs;
      if (!jobs) {
        return;
      }
      for (const job of jobs.values()) {
        assertJobPayloadHasNoCredentials(job as { payload?: Record<string, unknown> });
      }
    });

    it("uses generic errors for provider mismatch without tenant leakage", async () => {
      if (!fixture.eligibility.webhookCapable || !("webhook" in fixture) || !fixture.webhook) {
        return;
      }
      const stack = await fixture.createStack();
      const request = fixture.webhook.buildValidSignedRequest(stack);
      const mismatched = { ...request, provider: "airbnb" as typeof request.provider };
      const result = await stack.webhookTransportUseCase!.execute(mismatched);
      expect(result.ackAllowed).toBe(false);
      assertNoSecretLeakage(result.errorMessage);
    });
  });
}

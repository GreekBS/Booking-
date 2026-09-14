import { describe, expect, it, vi } from "vitest";
import type { ProviderContractFixture } from "../../../../../src/channels/contract/ProviderContractFixtureTypes";
import {
  assertAckOnlyAfterDurableReceive,
  assertDeclaredSourceEventsReachInbox,
  assertInboxContainsKind,
  assertInboxEvidencePreserved,
} from "../assertions/invariantAssertions";
import {
  assertInboxUnknownTaxonomy,
  deriveRequireUnknownTaxonomyEnvelope,
} from "../assertions/taxonomyAssertions";
import { readUnknownClassification } from "../../../../../src/channels/types/readUnknownClassification";

export function runUniversalReservationInvariantsSuite(fixture: ProviderContractFixture): void {
  describe("universal reservation invariants", () => {
    it("reservation.create reaches durable Receive via webhook when webhook-capable", async () => {
      requireWebhookOrSkip(fixture);
      if (!fixture.eligibility.webhookCapable) {
        return;
      }
      const stack = await fixture.createStack();
      const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase!, "execute");
      const request = fixture.webhook!.buildValidSignedRequest(stack);
      const result = await stack.webhookTransportUseCase!.execute(request);
      expect(result.ackAllowed).toBe(true);
      expect(receiveSpy).toHaveBeenCalled();
      assertAckOnlyAfterDurableReceive(result);
      assertInboxContainsKind(stack, "reservation.create");
    });

    it("reservation.create reaches durable Receive via polling when polling-capable", async () => {
      requirePollingOrSkip(fixture);
      if (!fixture.eligibility.pollingCapable) {
        return;
      }
      const stack = await fixture.createStack();
      const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase!, "execute");
      fixture.polling!.seedReservationKindPoll(stack, "create");
      const result = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(result.ackAllowed).toBe(true);
      expect(receiveSpy).toHaveBeenCalled();
      assertAckOnlyAfterDurableReceive(result);
      assertInboxContainsKind(stack, "reservation.create");
    });

    it("reservation.modify reaches Inbox via webhook when webhook-capable", async () => {
      requireWebhookOrSkip(fixture);
      if (!fixture.eligibility.webhookCapable) {
        return;
      }
      const stack = await fixture.createStack();
      const message = fixture.expectations.expectedReservationMessages.modify;
      stack.webhookProvider?.setParseHandler?.(async () => [message]);
      const request = fixture.webhook!.buildValidSignedRequest(stack);
      const result = await stack.webhookTransportUseCase!.execute(request);
      expect(result.ackAllowed).toBe(true);
      assertInboxContainsKind(stack, "reservation.modify");
    });

    it("reservation.modify reaches Inbox via polling when polling-capable", async () => {
      requirePollingOrSkip(fixture);
      if (!fixture.eligibility.pollingCapable) {
        return;
      }
      const stack = await fixture.createStack();
      fixture.polling!.seedReservationKindPoll(stack, "modify");
      const result = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(result.ackAllowed).toBe(true);
      assertInboxContainsKind(stack, "reservation.modify");
    });

    it("reservation.cancel reaches Inbox via webhook when webhook-capable", async () => {
      requireWebhookOrSkip(fixture);
      if (!fixture.eligibility.webhookCapable) {
        return;
      }
      const stack = await fixture.createStack();
      stack.webhookProvider?.setParseHandler?.(async () => [
        fixture.expectations.expectedReservationMessages.cancel,
      ]);
      const request = fixture.webhook!.buildValidSignedRequest(stack);
      const result = await stack.webhookTransportUseCase!.execute(request);
      expect(result.ackAllowed).toBe(true);
      assertInboxContainsKind(stack, "reservation.cancel");
    });

    it("reservation.cancel reaches Inbox via polling when polling-capable", async () => {
      requirePollingOrSkip(fixture);
      if (!fixture.eligibility.pollingCapable) {
        return;
      }
      const stack = await fixture.createStack();
      fixture.polling!.seedReservationKindPoll(stack, "cancel");
      const result = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(result.ackAllowed).toBe(true);
      assertInboxContainsKind(stack, "reservation.cancel");
    });

    it("reservation.unknown reaches Inbox via webhook when webhook-capable", async () => {
      requireWebhookOrSkip(fixture);
      if (!fixture.eligibility.webhookCapable) {
        return;
      }
      const stack = await fixture.createStack();
      const request = fixture.webhook!.buildUnknownReservationRequest(stack);
      const result = await stack.webhookTransportUseCase!.execute(request);
      expect(result.ackAllowed).toBe(true);
      assertInboxContainsKind(stack, "reservation.unknown");
      assertUnknownTaxonomyForFixture(stack, fixture);
    });

    it("reservation.unknown reaches Inbox via polling when polling-capable", async () => {
      requirePollingOrSkip(fixture);
      if (!fixture.eligibility.pollingCapable) {
        return;
      }
      const stack = await fixture.createStack();
      fixture.polling!.seedReservationKindPoll(stack, "unknown");
      const result = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(result.ackAllowed).toBe(true);
      assertInboxContainsKind(stack, "reservation.unknown");
      assertUnknownTaxonomyForFixture(stack, fixture);
    });

    it("reservation events never use ack_without_persist path", async () => {
      if (fixture.eligibility.pollingCapable) {
        requirePollingOrSkip(fixture);
        const stack = await fixture.createStack();
        const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase!, "execute");
        fixture.polling!.seedReservationKindPoll(stack, "unknown");
        await stack.pollConnectionUseCase!.execute({
          tenantId: stack.tenantId,
          connectionId: stack.connectionId,
        });
        expect(receiveSpy).toHaveBeenCalled();
        return;
      }
      requireWebhookOrSkip(fixture);
      if (!fixture.eligibility.webhookCapable) {
        expect.fail("Fixture must be webhook-capable or polling-capable");
      }
      const stack = await fixture.createStack();
      const receiveSpy = vi.spyOn(stack.receiveChannelEventUseCase!, "execute");
      const request = fixture.webhook!.buildUnknownReservationRequest(stack);
      await stack.webhookTransportUseCase!.execute(request);
      expect(receiveSpy).toHaveBeenCalled();
    });

    it("partial batch denies ACK and preserves cursor when polling", async () => {
      requirePollingOrSkip(fixture);
      if (!fixture.eligibility.pollingCapable) {
        return;
      }
      const stack = await fixture.createStack();
      fixture.polling!.seedPartialBatchPoll?.(stack);
      const result = await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      expect(result.ackAllowed).toBe(false);
      expect(result.cursorAdvanced).toBe(false);
    });
  });
}

export function runUnknownEventPolicySuite(fixture: ProviderContractFixture): void {
  describe("unknown reservation event policy", () => {
    it("maps unsupported reservation event to reservation.unknown with evidence", async () => {
      if (fixture.eligibility.pollingCapable) {
        requirePollingOrSkip(fixture);
        const stack = await fixture.createStack();
        fixture.polling!.seedReservationKindPoll(stack, "unknown");
        const result = await stack.pollConnectionUseCase!.execute({
          tenantId: stack.tenantId,
          connectionId: stack.connectionId,
        });
        expect(result.ackAllowed).toBe(true);
        assertInboxEvidencePreserved(
          stack,
          {
            providerEventType: "reservation.reinstated",
            providerEventId: "evt-reinstated-1",
            externalReservationId: "ext-reinstated-1",
          },
          taxonomyOptionsForFixture(fixture),
        );
        return;
      }
      requireWebhookOrSkip(fixture);
      if (!fixture.eligibility.webhookCapable) {
        expect.fail("Fixture must be webhook-capable or polling-capable");
      }
      const stack = await fixture.createStack();
      const request = fixture.webhook!.buildUnknownReservationRequest(stack);
      const result = await stack.webhookTransportUseCase!.execute(request);
      expect(result.ackAllowed).toBe(true);
      assertInboxEvidencePreserved(
        stack,
        {
          providerEventType: "reservation.reinstated",
          providerEventId: "evt-reinstated-1",
          externalReservationId: "ext-reinstated-1",
        },
        taxonomyOptionsForFixture(fixture),
      );
    });

    it("denies ACK for invalid normalized kind when webhook supports it", async () => {
      if (!fixture.eligibility.webhookCapable) {
        return;
      }
      requireWebhookOrSkip(fixture);
      if (!fixture.webhook?.buildInvalidKindRequest) {
        return;
      }
      const stack = await fixture.createStack();
      const request = fixture.webhook.buildInvalidKindRequest(stack);
      const result = await stack.webhookTransportUseCase!.execute(request);
      expect(result.ackAllowed).toBe(false);
    });

    it("requires declared reservation source events to reach Inbox after poll", async () => {
      requirePollingOrSkip(fixture);
      if (!fixture.eligibility.pollingCapable) {
        return;
      }
      const declared = fixture.expectations.expectedSourceEvents ?? [];
      if (declared.filter((event) => event.reservationRelated).length === 0) {
        return;
      }
      const stack = await fixture.createStack();
      fixture.polling!.seedInitialPoll(stack);
      await stack.pollConnectionUseCase!.execute({
        tenantId: stack.tenantId,
        connectionId: stack.connectionId,
      });
      assertDeclaredSourceEventsReachInbox(stack, fixture.expectations.expectedSourceEvents);
    });
  });
}

/** Webhook-only fixtures skip; pollingCapable without polling section fails. */
function requirePollingOrSkip(fixture: ProviderContractFixture): void {
  if (!fixture.eligibility.pollingCapable) {
    return;
  }
  if (!("polling" in fixture) || fixture.polling == null) {
    expect.fail(
      "pollingCapable eligibility requires a polling fixture section (polling-only suites must not silently skip)",
    );
  }
}

/** Polling-only fixtures skip; webhookCapable without webhook section fails. */
function requireWebhookOrSkip(fixture: ProviderContractFixture): void {
  if (!fixture.eligibility.webhookCapable) {
    return;
  }
  if (!("webhook" in fixture) || fixture.webhook == null) {
    expect.fail("webhookCapable eligibility requires a webhook fixture section");
  }
}

function taxonomyOptionsForFixture(fixture: ProviderContractFixture) {
  const unknownMessage = fixture.expectations.expectedReservationMessages.unknown;
  const requireEnvelope = deriveRequireUnknownTaxonomyEnvelope(unknownMessage);
  if (!requireEnvelope) {
    return { requireEnvelope: false };
  }
  const readResult = readUnknownClassification(unknownMessage.payload);
  if (readResult.isFailure) {
    expect.fail(
      `Fixture unknown message taxonomy is unreadable: ${readResult.getError().message}`,
    );
  }
  const classification = readResult.getValue();
  return {
    requireEnvelope: true,
    expected: {
      taxonomyVersion: classification.taxonomyVersion,
      category: classification.category,
      reasonCode: classification.reasonCode,
      reclassifiable: classification.reclassifiable,
    },
  };
}

function assertUnknownTaxonomyForFixture(
  stack: Parameters<typeof assertInboxUnknownTaxonomy>[0],
  fixture: ProviderContractFixture,
): void {
  assertInboxUnknownTaxonomy(stack, taxonomyOptionsForFixture(fixture));
}

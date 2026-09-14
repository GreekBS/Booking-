import { describe, expect, it } from "vitest";
import {
  assertDeclaredSourceEventsReachInbox,
  assertPollingCursorCompatibility,
} from "./harness/assertions/invariantAssertions";
import { createReferencePollingOnlyProviderContractFixture } from "./fixtures/referencePollingOnlyProviderContractFixture";

describe("polling-only negative conformance (S0a)", () => {
  it("detects omitted declared reservation source as conformance failure", async () => {
    const fixture = createReferencePollingOnlyProviderContractFixture({
      omitDeclaredSourcesOnPoll: true,
    });
    expect("webhook" in fixture && fixture.webhook).toBeFalsy();
    const stack = await fixture.createStack();
    fixture.polling.seedInitialPoll(stack);
    const result = await stack.pollConnectionUseCase!.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });
    expect(result.ackAllowed).toBe(true);
    expect(() =>
      assertDeclaredSourceEventsReachInbox(stack, fixture.expectations.expectedSourceEvents),
    ).toThrow(/conformance failure.*omitted/i);
  });

  it("passes when no source events are declared and provider returns empty", async () => {
    const fixture = createReferencePollingOnlyProviderContractFixture({
      expectedSourceEvents: [],
    });
    const stack = await fixture.createStack();
    fixture.polling.seedEmptyPoll(stack);
    const result = await stack.pollConnectionUseCase!.execute({
      tenantId: stack.tenantId,
      connectionId: stack.connectionId,
    });
    expect(result.ackAllowed).toBe(true);
    expect(() =>
      assertDeclaredSourceEventsReachInbox(stack, fixture.expectations.expectedSourceEvents),
    ).not.toThrow();
  });

  it("treats destructiveCursor declaration as conformance failure", () => {
    expect(() => assertPollingCursorCompatibility({ destructiveCursor: true })).toThrow(
      /destructive or single-use cursor/i,
    );
  });

  it("accepts non-destructive cursor declaration", () => {
    expect(() => assertPollingCursorCompatibility({ destructiveCursor: false })).not.toThrow();
  });
});

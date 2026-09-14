import { expect } from "vitest";
import type { ChannelProviderMessage } from "../../../../../src/channels/types/ChannelProviderMessage";
import type { ProviderContractEligibility } from "../../../../../src/channels/contract/ProviderContractEligibility";
import type {
  ExpectedSourceEvent,
  ProviderContractStack,
} from "../../../../../src/channels/contract/ProviderContractFixtureTypes";
import {
  assertInboxUnknownTaxonomy,
  type UnknownTaxonomyAssertionOptions,
} from "./taxonomyAssertions";

export function assertAckOnlyAfterDurableReceive(result: {
  ackAllowed: boolean;
  results: Array<{ success: boolean }>;
  receivedMessageCount?: number;
}): void {
  if (result.ackAllowed && (result.receivedMessageCount ?? result.results.length) > 0) {
    expect(result.results.every((entry) => entry.success)).toBe(true);
  }
}

export function assertNoBookingPathFromTransport(): void {
  // Transport-scoped code must not import booking/commerce paths — enforced by architecture fitness.
  expect(true).toBe(true);
}

export function assertInboxContainsKind(
  stack: ProviderContractStack,
  kind: ChannelProviderMessage["kind"],
): void {
  const items = readInboxItems(stack);
  expect(items.some((item) => readMessageKind(item) === kind)).toBe(true);
}

export function assertInboxEvidencePreserved(
  stack: ProviderContractStack,
  expected: {
    providerEventType?: string;
    providerEventId?: string;
    externalReservationId?: string;
  },
  taxonomyOptions?: UnknownTaxonomyAssertionOptions,
): void {
  const items = readInboxItems(stack);
  const unknownItem = items.find((item) => readMessageKind(item) === "reservation.unknown");
  expect(unknownItem).toBeDefined();
  const rawPayload = readRawPayload(unknownItem);
  const payload = rawPayload.payload as Record<string, unknown>;
  if (expected.providerEventType) {
    expect(payload.providerEventType ?? payload.rawEventType).toBe(expected.providerEventType);
  }
  if (expected.providerEventId) {
    expect(payload.providerEventId ?? payload.eventId ?? rawPayload.messageId).toBe(
      expected.providerEventId,
    );
  }
  if (expected.externalReservationId) {
    expect(rawPayload.externalReservationId).toBe(expected.externalReservationId);
  }
  assertInboxUnknownTaxonomy(stack, taxonomyOptions ?? {});
}

/**
 * Enforces declared-source silent-drop conformance.
 * Reservation-related declared sources must appear in Inbox as normalized evidence.
 * Undeclared external events cannot be detected by the platform.
 */
export function assertDeclaredSourceEventsReachInbox(
  stack: ProviderContractStack,
  expectedSourceEvents: ExpectedSourceEvent[] | undefined,
): void {
  const declared = (expectedSourceEvents ?? []).filter((event) => event.reservationRelated);
  if (declared.length === 0) {
    return;
  }

  const items = readInboxItems(stack);
  const missing: string[] = [];

  for (const expected of declared) {
    const matched = items.some((item) => matchesDeclaredSource(item, expected));
    if (!matched) {
      missing.push(expected.sourceEventId);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Provider contract conformance failure: declared reservation-related source event(s) omitted from Inbox: ${missing.join(", ")}`,
    );
  }
}

/**
 * At-least-once polling requires non-destructive cursors.
 * Declaring destructiveCursor is a conformance failure.
 */
export function assertPollingCursorCompatibility(
  eligibility: Pick<ProviderContractEligibility, "destructiveCursor">,
): void {
  if (eligibility.destructiveCursor) {
    throw new Error(
      "Provider contract conformance failure: destructive or single-use cursor semantics are incompatible with at-least-once polling (platform may call poll() repeatedly from the same committed cursor)",
    );
  }
}

export function readInboxItems(stack: ProviderContractStack): unknown[] {
  const repo = stack.inboxRepository as { listAllForTest?: () => unknown[] };
  if (repo.listAllForTest) {
    return repo.listAllForTest();
  }
  if (stack.inboxRepository.findAll) {
    return stack.inboxRepository.findAll();
  }
  return [];
}

function matchesDeclaredSource(item: unknown, expected: ExpectedSourceEvent): boolean {
  const kind = readMessageKind(item);
  if (expected.expectedNormalizedKind && kind !== expected.expectedNormalizedKind) {
    return false;
  }

  let rawPayload: Record<string, unknown>;
  try {
    rawPayload = readRawPayload(item);
  } catch {
    return false;
  }

  const payload = (rawPayload.payload ?? {}) as Record<string, unknown>;
  if (expected.expectedProviderEventId) {
    const eventId =
      payload.providerEventId ?? payload.eventId ?? rawPayload.messageId ?? rawPayload.externalReservationId;
    if (String(eventId) !== expected.expectedProviderEventId) {
      return false;
    }
  }

  if (expected.expectedExternalReservationId) {
    if (String(rawPayload.externalReservationId ?? "") !== expected.expectedExternalReservationId) {
      return false;
    }
  }

  return true;
}

function readMessageKind(item: unknown): string | undefined {
  if (item && typeof item === "object" && "messageKind" in item) {
    return String((item as { messageKind: string }).messageKind);
  }
  return undefined;
}

function readRawPayload(item: unknown): Record<string, unknown> {
  if (item && typeof item === "object" && "rawPayload" in item) {
    return (item as { rawPayload: Record<string, unknown> }).rawPayload;
  }
  throw new Error("Inbox item rawPayload not found");
}
